/**
 * What a file or a pasted text really is, and whether TLDWatch takes it.
 * Files are judged by their first bytes, never by name or browser-reported
 * type alone, so the same check runs in the browser and again on the server.
 * Only types the Summary engine reads are allowed; anything that could carry
 * a script (SVG, HTML), run (programs), or hide something (archives, Office
 * files) is refused.
 */
import { parseVideoUrl } from "./video-url";

export type FileKind = "video" | "audio" | "pdf" | "image" | "text";

export type FileCheck =
  | { ok: true; kind: FileKind; mimeType: string }
  | { ok: false; reason: "unsupported" | "mismatch" };

/**
 * The kinds that are uploaded as files. A text file isn't: the browser reads
 * it and sends it like a pasted text, so it never reaches Storage.
 */
export const UPLOADABLE_KINDS: ReadonlySet<FileKind> = new Set<FileKind>(["video", "audio", "pdf", "image"]);

/** Every type `checkFile` can find for an uploadable kind. */
export const UPLOAD_MIME_TYPES = [
  "video/mp4",
  "video/mov",
  "video/3gpp",
  "video/webm",
  "video/avi",
  "video/x-flv",
  "video/wmv",
  "video/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/m4a",
  "audio/wav",
  "audio/aiff",
  "audio/ogg",
  "audio/flac",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** The most pages a PDF may have: the engine reads up to 1,000. */
export const PDF_MAX_PAGES = 1000;

/**
 * A PDF's page count, by counting its page objects; null when they can't be
 * seen (compressed object streams hide them), so the engine's own limit applies.
 */
export function pdfPageCount(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return pages > 0 ? pages : null;
}

/** How many of a file's first bytes `checkFile` needs to see. */
export const FILE_HEAD_BYTES = 4096;

/** The longest text TLDWatch summarizes, in characters. */
export const LONG_TEXT_MAX_CHARACTERS = 100_000;

/** Longer than this, or over several lines, a paste is a text, not a link. */
const LINK_MAX_CHARACTERS = 300;

/** Extensions TLDWatch knows, and the kind each one promises. */
const EXTENSION_KINDS: Record<string, FileKind> = {
  mp4: "video",
  m4v: "video",
  mov: "video",
  mpeg: "video",
  mpg: "video",
  avi: "video",
  flv: "video",
  webm: "video",
  wmv: "video",
  "3gp": "video",
  "3gpp": "video",
  mp3: "audio",
  wav: "audio",
  aif: "audio",
  aiff: "audio",
  aac: "audio",
  m4a: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  flac: "audio",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  heic: "image",
  heif: "image",
  txt: "text",
  md: "text",
  markdown: "text",
  csv: "text",
};

/** Judges a file by its first bytes (see FILE_HEAD_BYTES) and its name. */
export function checkFile(file: { name: string; head: Uint8Array; browserType?: string }): FileCheck {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const promised = extension ? EXTENSION_KINDS[extension] : undefined;

  const sniffed = sniff(file.head);
  if (sniffed) {
    // A known name that promises another kind is a disguise, or a mistake: refuse either way.
    if (promised && promised !== sniffed.kind) return { ok: false, reason: "mismatch" };
    return { ok: true, ...sniffed };
  }

  // Plain text has no signature: it must say it's text, and look like it.
  const saysText = promised === "text" || (!extension && file.browserType === "text/plain");
  if (saysText && looksLikePlainText(file.head)) {
    return { ok: true, kind: "text", mimeType: "text/plain" };
  }
  return { ok: false, reason: "unsupported" };
}

export type TextJudgement =
  | { kind: "link" }
  | { kind: "text"; characters: number }
  | { kind: "too-long"; characters: number; limit: number };

/**
 * Whether what was typed or pasted is a link or a long text. A YouTube link
 * is always a link; a short single line that isn't one is a bad link, so it
 * gets the link's explanation rather than a Summary of four words.
 */
export function judgeText(input: string): TextJudgement {
  const text = input.trim();
  if (parseVideoUrl(text).ok) return { kind: "link" };
  if (text.length <= LINK_MAX_CHARACTERS && !text.includes("\n")) return { kind: "link" };
  if (text.length > LONG_TEXT_MAX_CHARACTERS) {
    return { kind: "too-long", characters: text.length, limit: LONG_TEXT_MAX_CHARACTERS };
  }
  return { kind: "text", characters: text.length };
}

function sniff(head: Uint8Array): { kind: FileKind; mimeType: string } | null {
  const at = (offset: number, text: string) =>
    [...text].every((char, i) => head[offset + i] === char.charCodeAt(0));
  const bytesAt = (offset: number, values: number[]) => values.every((v, i) => head[offset + i] === v);

  if (at(0, "%PDF-")) return { kind: "pdf", mimeType: "application/pdf" };
  if (bytesAt(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mimeType: "image/png" };
  if (bytesAt(0, [0xff, 0xd8, 0xff])) return { kind: "image", mimeType: "image/jpeg" };

  if (at(0, "RIFF")) {
    if (at(8, "WEBP")) return { kind: "image", mimeType: "image/webp" };
    if (at(8, "WAVE")) return { kind: "audio", mimeType: "audio/wav" };
    if (at(8, "AVI ")) return { kind: "video", mimeType: "video/avi" };
    return null;
  }

  // ISO media (MP4, MOV, 3GP, M4A, HEIC): "ftyp" at 4, then the brand.
  if (at(4, "ftyp")) {
    const brand = String.fromCharCode(...head.slice(8, 12));
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) {
      return { kind: "image", mimeType: "image/heic" };
    }
    if (["mif1", "msf1"].includes(brand)) return { kind: "image", mimeType: "image/heif" };
    if (["M4A ", "M4B "].includes(brand)) return { kind: "audio", mimeType: "audio/m4a" };
    if (brand === "qt  ") return { kind: "video", mimeType: "video/mov" };
    if (brand.startsWith("3g")) return { kind: "video", mimeType: "video/3gpp" };
    return { kind: "video", mimeType: "video/mp4" };
  }

  // EBML: WebM is allowed, other Matroska files aren't.
  if (bytesAt(0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return containsText(head.slice(0, 64), "webm") ? { kind: "video", mimeType: "video/webm" } : null;
  }
  if (at(0, "FLV")) return { kind: "video", mimeType: "video/x-flv" };
  if (bytesAt(0, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return { kind: "video", mimeType: "video/wmv" };
  if (bytesAt(0, [0, 0, 1]) && (head[3] === 0xba || head[3] === 0xb3)) {
    return { kind: "video", mimeType: "video/mpeg" };
  }

  if (at(0, "ID3")) return { kind: "audio", mimeType: "audio/mp3" };
  if (head[0] === 0xff && head.length > 1 && (head[1] & 0xe0) === 0xe0) {
    const layer = (head[1] >> 1) & 0b11;
    if (layer === 0b00 && (head[1] & 0xf0) === 0xf0) return { kind: "audio", mimeType: "audio/aac" };
    if (layer === 0b01) return { kind: "audio", mimeType: "audio/mp3" };
    return null;
  }
  if (at(0, "FORM") && (at(8, "AIFF") || at(8, "AIFC"))) return { kind: "audio", mimeType: "audio/aiff" };
  if (at(0, "OggS")) return { kind: "audio", mimeType: "audio/ogg" };
  if (at(0, "fLaC")) return { kind: "audio", mimeType: "audio/flac" };

  return null;
}

function containsText(bytes: Uint8Array, text: string): boolean {
  return String.fromCharCode(...bytes).includes(text);
}

/** Readable text: no NUL bytes, valid UTF-8, and not markup a browser would run. */
function looksLikePlainText(head: Uint8Array): boolean {
  if (head.length === 0 || head.includes(0)) return false;
  let text: string;
  try {
    // A cut-off final character is fine: only the first bytes are checked.
    text = new TextDecoder("utf-8", { fatal: true }).decode(trimPartialCharacter(head));
  } catch {
    return false;
  }
  const start = text.replace(/^﻿/, "").trimStart().slice(0, 200).toLowerCase();
  return !/^<(\?xml|!doctype|html|svg|script|head|body|iframe)\b/.test(start);
}

/** Drops a UTF-8 character split by the cut at the end of a file's head. */
function trimPartialCharacter(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;
  let back = 0;
  while (back < 3 && end - back - 1 >= 0 && (bytes[end - back - 1] & 0xc0) === 0x80) back++;
  const lead = bytes[end - back - 1];
  if (lead !== undefined && lead >= 0xc0) {
    const needed = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
    if (back + 1 < needed) end -= back + 1;
  }
  return bytes.slice(0, end);
}
