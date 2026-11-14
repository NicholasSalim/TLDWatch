import { checkFile, FILE_HEAD_BYTES, UPLOADABLE_KINDS, type FileKind } from "@/core/file-kind";

/** The largest file the browser lets through; the server checks again with its own limit. */
export const UPLOAD_MAX_MB = 50;

/** What can be uploaded, as the paperclip menu lists it. */
export const UPLOAD_KINDS: { kind: FileKind; label: string; formats: string; accept: string }[] = [
  {
    kind: "video",
    label: "Video",
    formats: "MP4, MOV, WebM, AVI, MPEG, WMV, FLV, 3GP",
    accept: ".mp4,.m4v,.mov,.webm,.avi,.mpeg,.mpg,.wmv,.flv,.3gp,.3gpp",
  },
  {
    kind: "audio",
    label: "Audio",
    formats: "MP3, M4A, WAV, AAC, OGG, FLAC, AIFF",
    accept: ".mp3,.m4a,.wav,.aac,.ogg,.oga,.opus,.flac,.aif,.aiff",
  },
  { kind: "pdf", label: "PDF", formats: "PDF documents", accept: ".pdf" },
  { kind: "image", label: "Image", formats: "PNG, JPEG, WebP, HEIC", accept: ".png,.jpg,.jpeg,.webp,.heic,.heif" },
  { kind: "text", label: "Text file", formats: "TXT, Markdown, CSV", accept: ".txt,.md,.markdown,.csv" },
];

export const KIND_NAMES: Record<FileKind, string> = {
  video: "video",
  audio: "audio file",
  pdf: "PDF",
  image: "image",
  text: "text file",
};

export type Inspection =
  | { ok: true; kind: FileKind; mimeType: string; uploadable: boolean }
  | { ok: false; message: string };

/**
 * Checks a picked, dropped or pasted file before anything is sent: its size,
 * then what its first bytes say it is. The server checks the bytes again.
 */
export async function inspectFile(file: File): Promise<Inspection> {
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
    return { ok: false, message: `That file is over ${UPLOAD_MAX_MB} MB, the largest TLDWatch accepts.` };
  }
  const head = new Uint8Array(await file.slice(0, FILE_HEAD_BYTES).arrayBuffer());
  const check = checkFile({ name: file.name, head, browserType: file.type });
  if (!check.ok) {
    return {
      ok: false,
      message:
        check.reason === "mismatch"
          ? `That file's name says one thing but its contents say another, so TLDWatch won't open it.`
          : "TLDWatch can't summarize that kind of file. Try a video, audio file, PDF, image or plain-text file.",
    };
  }
  return { ...check, uploadable: UPLOADABLE_KINDS.has(check.kind) };
}
