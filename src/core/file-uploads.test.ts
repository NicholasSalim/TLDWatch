import { describe, expect, it } from "vitest";
import { createCore } from "./core";
import type { Requester } from "./requester";
import {
  FakeNaturalVoice,
  FakeSummaryEngine,
  FakeTranslator,
  FakeVideoCatalog,
  InMemoryHistoryStore,
  InMemoryMemberStore,
  InMemoryNarrationAudioStore,
  InMemorySummaryStore,
  InMemoryUploadStorage,
  InMemoryUsageCounters,
  fixedClock,
  validEngineOutput,
} from "./testing";

const member: Requester = { kind: "member", memberId: "m-1" };
const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const MP3 = new Uint8Array([...ascii("ID3"), 4, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
/** A small PDF whose page objects can be counted. */
const pdf = (pages: number) =>
  new TextEncoder().encode(`%PDF-1.7\n${"<< /Type /Page /Parent 2 0 R >>\n".repeat(pages)}<< /Type /Pages /Count ${pages} >>`);

const files = {
  audio: { bytes: MP3, mimeType: "audio/mp3", durationSeconds: 600 },
  pdf: { bytes: pdf(12), mimeType: "application/pdf", durationSeconds: 0 },
  image: { bytes: PNG, mimeType: "image/png", durationSeconds: 0 },
};

function setup() {
  const engine = new FakeSummaryEngine(() => validEngineOutput("en"));
  const uploads = new InMemoryUploadStorage();
  const usage = new InMemoryUsageCounters();
  let n = 0;
  const core = createCore({
    engine,
    translator: new FakeTranslator(),
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage,
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(),
    voice: new FakeNaturalVoice(),
    narrationAudio: new InMemoryNarrationAudioStore(),
    uploads,
    clock: fixedClock(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  /** Starts an Upload of this file and puts its bytes where the browser would. */
  const upload = async (requester: Requester, file: { bytes: Uint8Array; mimeType: string; durationSeconds: number }) => {
    const started = await core.startUpload(requester, { sizeBytes: file.bytes.length, ...file });
    if (started.status !== "ready") throw new Error(`couldn't start: ${started.reason}`);
    uploads.put(new URL(started.uploadUrl).pathname.slice(1), { bytes: file.bytes, mimeType: file.mimeType });
    return started.uploadId;
  };
  return { core, engine, uploads, usage, upload };
}

describe("an audio Upload", () => {
  it("is summarized with Timestamps, as audio", async () => {
    const { core, engine, uploads, upload } = setup();
    const id = await upload(member, files.audio);

    const result = await core.summarizeUpload(member, id);

    expect(result).toMatchObject({ status: "ready", summary: { source: "audio", ownerId: "m-1" } });
    if (result.status !== "ready") return;
    expect(result.summary.lengths.medium.timestamps.length).toBeGreaterThan(0);
    expect(engine.fileKinds).toEqual(["audio"]);
    expect(engine.fileCalls[0]?.mimeType).toBe("audio/mp3");
    expect(uploads.files.size).toBe(0);
  });

  it("has the same length limits as a video, checked before it's uploaded", async () => {
    const { core } = setup();
    expect(await core.startUpload(member, { ...files.audio, sizeBytes: 9, durationSeconds: 31 * 60 })).toMatchObject({
      reason: "video-too-long",
      limitMinutes: 30,
    });
    expect(await core.startUpload(guest, { ...files.audio, sizeBytes: 9, durationSeconds: 16 * 60 })).toMatchObject({
      reason: "video-too-long",
      limitMinutes: 15,
    });
  });
});

describe("a PDF Upload", () => {
  it("is summarized with references to pages instead of Timestamps", async () => {
    const { core, engine, upload } = setup();
    const id = await upload(guest, files.pdf);

    const result = await core.summarizeUpload(guest, id);

    expect(result).toMatchObject({ status: "ready", summary: { source: "pdf", ownerId: "guest-g-1" } });
    expect(engine.fileKinds).toEqual(["pdf"]);
  });

  it("refuses a PDF over 1,000 pages before the engine reads it, deleting it and counting nothing", async () => {
    const { core, engine, uploads, upload } = setup();
    const id = await upload(guest, { ...files.pdf, bytes: pdf(1001) });

    expect(await core.summarizeUpload(guest, id)).toEqual({
      status: "rejected",
      reason: "pdf-too-long",
      limitPages: 1000,
    });
    expect(engine.fileCalls).toHaveLength(0);
    expect(uploads.files.size).toBe(0);
    expect((await core.summariesLeftToday(guest)).left).toBe(3);
  });
});

describe("an image Upload", () => {
  it("is summarized with no Timestamps, whatever the engine says", async () => {
    const { core, engine, upload } = setup();
    const id = await upload(member, files.image);

    const result = await core.summarizeUpload(member, id);

    expect(result).toMatchObject({ status: "ready", summary: { source: "image" } });
    if (result.status !== "ready") return;
    expect(result.summary.lengths.detailed.timestamps).toEqual([]);
    expect(engine.fileKinds).toEqual(["image"]);
  });
});

describe("what can be uploaded", () => {
  it.each([
    ["a ZIP", "application/zip"],
    ["an SVG", "image/svg+xml"],
    // Text files are read in the browser and sent like a pasted text, never stored.
    ["a text file", "text/plain"],
  ])("refuses %s before anything is uploaded", async (_, mimeType) => {
    const { core } = setup();
    expect(await core.startUpload(member, { sizeBytes: 100, durationSeconds: 0, mimeType })).toEqual({
      status: "rejected",
      reason: "upload-not-supported",
    });
  });

  it("goes by the stored bytes, not the type the browser declared", async () => {
    const { core, engine, uploads } = setup();
    const started = await core.startUpload(member, { sizeBytes: 9, durationSeconds: 0, mimeType: "image/png" });
    if (started.status !== "ready") throw new Error("couldn't start");
    uploads.put(`m-1/${started.uploadId}`, { bytes: pdf(3), mimeType: "image/png" });

    const result = await core.summarizeUpload(member, started.uploadId);

    expect(result).toMatchObject({ status: "ready", summary: { source: "pdf" } });
    expect(engine.fileCalls[0]?.mimeType).toBe("application/pdf");
  });

  it("is a video unless it says otherwise, as before", async () => {
    const { core, upload } = setup();
    const head = new Uint8Array([0, 0, 0, 0x20, ...ascii("ftypisom"), 0, 0, 2, 0]);
    const id = await upload(member, { bytes: head, mimeType: "video/mp4", durationSeconds: 60 });

    const result = await core.summarizeUpload(member, id);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary.source).toBeUndefined();
  });
});
