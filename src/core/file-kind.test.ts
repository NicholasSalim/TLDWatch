import { describe, expect, it } from "vitest";
import { checkFile, LONG_TEXT_MAX_CHARACTERS, judgeText } from "./file-kind";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? ascii(p) : p)));
/** An ISO media file's first bytes: a size, "ftyp", then its brand. */
const ftyp = (brand: string) => bytes([0, 0, 0, 0x20], "ftyp", brand, [0, 0, 0, 0], "isommp41");
const riff = (form: string) => bytes("RIFF", [0x24, 0, 0, 0], form);

describe("telling what a file really is, by its first bytes", () => {
  it.each([
    ["clip.mp4", ftyp("isom"), "video", "video/mp4"],
    ["clip.mp4", ftyp("mp42"), "video", "video/mp4"],
    ["phone.mov", ftyp("qt  "), "video", "video/mov"],
    ["old.3gp", ftyp("3gp5"), "video", "video/3gpp"],
    ["clip.webm", bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], "webm"), "video", "video/webm"],
    ["clip.avi", riff("AVI "), "video", "video/avi"],
    ["clip.flv", bytes("FLV", [1, 5]), "video", "video/x-flv"],
    ["clip.wmv", bytes([0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11]), "video", "video/wmv"],
    ["clip.mpg", bytes([0, 0, 1, 0xba, 0x44]), "video", "video/mpeg"],
    ["talk.mp3", bytes("ID3", [4, 0, 0]), "audio", "audio/mp3"],
    ["talk.mp3", bytes([0xff, 0xfb, 0x90, 0x64]), "audio", "audio/mp3"],
    ["talk.aac", bytes([0xff, 0xf1, 0x50, 0x80]), "audio", "audio/aac"],
    ["memo.m4a", ftyp("M4A "), "audio", "audio/m4a"],
    ["talk.wav", riff("WAVE"), "audio", "audio/wav"],
    ["talk.aiff", bytes("FORM", [0, 0, 0, 0], "AIFF"), "audio", "audio/aiff"],
    ["talk.ogg", bytes("OggS", [0, 2]), "audio", "audio/ogg"],
    ["talk.flac", bytes("fLaC", [0, 0, 0, 0x22]), "audio", "audio/flac"],
    ["paper.pdf", bytes("%PDF-1.7\n"), "pdf", "application/pdf"],
    ["shot.png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image", "image/png"],
    ["photo.jpg", bytes([0xff, 0xd8, 0xff, 0xe0]), "image", "image/jpeg"],
    ["photo.webp", riff("WEBP"), "image", "image/webp"],
    ["photo.heic", ftyp("heic"), "image", "image/heic"],
    ["photo.heif", ftyp("mif1"), "image", "image/heif"],
    ["notes.txt", bytes("Meeting notes\nItem one"), "text", "text/plain"],
    ["readme.md", bytes("# Title\n\nSome *words*."), "text", "text/plain"],
    ["data.csv", bytes("name,age\nAda,36\n"), "text", "text/plain"],
  ])("%s is a %s file (%s)", (name, head, kind, mimeType) => {
    expect(checkFile({ name, head })).toEqual({ ok: true, kind, mimeType });
  });

  it("trusts the bytes, not a missing or odd name: a pasted screenshot has neither", () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(checkFile({ name: "", head: png })).toMatchObject({ ok: true, kind: "image" });
    expect(checkFile({ name: "image", head: png })).toMatchObject({ ok: true, kind: "image" });
  });

  it("takes pasted plain text the browser names text/plain even without an extension", () => {
    expect(checkFile({ name: "", head: bytes("Hello there"), browserType: "text/plain" })).toMatchObject({
      ok: true,
      kind: "text",
    });
  });
});

describe("refusing what isn't safe or can't be read", () => {
  it.each([
    ["an SVG, which can carry scripts", "logo.svg", bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ["an SVG disguised as text", "logo.txt", bytes('<?xml version="1.0"?><svg>')],
    ["an HTML page", "page.html", bytes("<!DOCTYPE html><html>")],
    ["an HTML page disguised as text", "page.txt", bytes("  <html><script>alert(1)</script>")],
    ["a script", "run.js", bytes("console.log('hi')")],
    ["a Windows program", "setup.exe", bytes("MZ", [0x90, 0])],
    ["a Mac or Linux program", "app", bytes([0x7f], "ELF")],
    ["a ZIP archive", "files.zip", bytes("PK", [3, 4])],
    ["a Word file (a ZIP inside)", "letter.docx", bytes("PK", [3, 4])],
    ["an old Office file", "sheet.xls", bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ["a RAR archive", "files.rar", bytes("Rar!", [0x1a, 7])],
    ["a GIF (the engine can't read it)", "funny.gif", bytes("GIF89a")],
    ["a Matroska video (not WebM)", "film.mkv", bytes([0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x82, 0x88], "matroska")],
    ["binary posing as text", "notes.txt", bytes("abc", [0, 0, 0, 1], "def")],
    ["text with an unknown extension", "notes.log", bytes("plain words")],
    ["an empty file", "clip.mp4", bytes()],
  ])("refuses %s", (_, name, head) => {
    expect(checkFile({ name, head })).toEqual({ ok: false, reason: "unsupported" });
  });

  it.each([
    ["a PDF named .mp4", "clip.mp4", bytes("%PDF-1.4")],
    ["a PNG named .pdf", "paper.pdf", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["an MP3 named .jpg", "photo.jpg", bytes("ID3", [4, 0, 0])],
    ["a video named .txt", "notes.txt", ftyp("isom")],
  ])("refuses %s: the name and the contents disagree", (_, name, head) => {
    expect(checkFile({ name, head })).toEqual({ ok: false, reason: "mismatch" });
  });

  it("refuses a known name whose contents are no supported type as unsupported, not mismatched", () => {
    expect(checkFile({ name: "clip.mp4", head: bytes("MZ", [0x90, 0]) })).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });
});

describe("telling a link from a long text", () => {
  it("treats a YouTube link as a link", () => {
    expect(judgeText("https://youtu.be/dQw4w9WgXcQ")).toEqual({ kind: "link" });
    expect(judgeText("  https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42  ")).toEqual({ kind: "link" });
  });

  it("treats a short line that isn't a link as a (bad) link, so it gets the link's explanation", () => {
    expect(judgeText("https://vimeo.com/123")).toEqual({ kind: "link" });
    expect(judgeText("cats")).toEqual({ kind: "link" });
  });

  it("treats anything longer than a link, or over several lines, as long text", () => {
    const article = "A sentence about something. ".repeat(20);
    expect(judgeText(article)).toEqual({ kind: "text", characters: article.trim().length });
    expect(judgeText("Line one\nLine two\nLine three")).toMatchObject({ kind: "text" });
  });

  it("refuses text over the limit, saying what the limit is", () => {
    expect(LONG_TEXT_MAX_CHARACTERS).toBe(100_000);
    expect(judgeText("x ".repeat(50_001))).toEqual({
      kind: "too-long",
      characters: 100_001,
      limit: 100_000,
    });
  });
});
