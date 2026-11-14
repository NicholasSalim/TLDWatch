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
const otherMember: Requester = { kind: "member", memberId: "m-2" };
const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };
const clip = { fileName: "clip.mp4", sizeBytes: 5_000_000, durationSeconds: 45, mimeType: "video/mp4" };

function setup() {
  const engine = new FakeSummaryEngine(() => validEngineOutput("ko"));
  const translator = new FakeTranslator();
  const uploads = new InMemoryUploadStorage();
  const voice = new FakeNaturalVoice();
  let n = 0;
  const core = createCore({
    engine,
    translator,
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(),
    voice,
    narrationAudio: new InMemoryNarrationAudioStore(),
    uploads,
    clock: fixedClock(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  /** Starts an Upload and does what the browser does: puts the file at the URL. */
  const upload = async (requester: Requester = member) => {
    const started = await core.startUpload(requester, clip);
    if (started.status !== "ready") throw new Error(`couldn't start: ${started.status}`);
    uploads.put(`${(requester as { memberId: string }).memberId}/${started.uploadId}`);
    return started.uploadId;
  };
  return { core, engine, translator, uploads, voice, upload };
}

describe("starting an Upload", () => {
  it("gives a Member a one-time URL in their own private folder", async () => {
    const { core } = setup();

    expect(await core.startUpload(member, clip)).toEqual({
      status: "ready",
      uploadId: "upload-00000000-0000-4000-8000-000000000001",
      uploadUrl: "https://uploads.test/m-1/upload-00000000-0000-4000-8000-000000000001?token=one-time",
    });
  });

  it.each([
    ["over 30 minutes", { durationSeconds: 30 * 60 + 1 }, { reason: "video-too-long", limitMinutes: 30 }],
    ["over the file-size limit", { sizeBytes: 50 * 1024 * 1024 + 1 }, { reason: "upload-too-large", limitMb: 50 }],
    ["not a type TLDWatch reads", { mimeType: "application/zip" }, { reason: "upload-not-supported" }],
  ])("turns away a file %s before it's uploaded", async (_, change, rejection) => {
    const { core } = setup();
    expect(await core.startUpload(member, { ...clip, ...change })).toEqual({ status: "rejected", ...rejection });
  });
});

describe("checks before the upload", () => {
  it("tells a Member with no Summaries left today before they upload anything", async () => {
    const { core, upload } = setup();
    for (let i = 0; i < 10; i++) await core.summarizeUpload(member, await upload());

    expect(await core.startUpload(member, clip)).toEqual({
      status: "rejected",
      reason: "daily-limit-reached",
      resetsAt: "2026-11-13T00:00:00.000Z",
    });
  });

  it("only takes formats the engine can read", async () => {
    const { core } = setup();
    expect(await core.startUpload(member, { ...clip, mimeType: "video/x-matroska" })).toEqual({
      status: "rejected",
      reason: "upload-not-supported",
    });
    expect((await core.startUpload(member, { ...clip, mimeType: "video/mov" })).status).toBe("ready");
  });
});

describe("checking the uploaded file itself", () => {
  const gif = { bytes: new TextEncoder().encode("GIF89a..."), mimeType: "video/mp4" };
  const program = { bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0]), mimeType: "video/mp4" };

  it.each([
    ["a GIF (which the engine can't read) the browser called a video", gif],
    ["a program the browser called a video", program],
  ])("refuses %s, deleting it and counting nothing", async (_, file) => {
    const { core, engine, uploads } = setup();
    const started = await core.startUpload(member, clip);
    if (started.status !== "ready") throw new Error("couldn't start");
    uploads.put(`m-1/${started.uploadId}`, file);

    expect(await core.summarizeUpload(member, started.uploadId)).toEqual({
      status: "rejected",
      reason: "upload-not-supported",
    });
    expect(engine.fileCalls).toHaveLength(0);
    expect(uploads.files.size).toBe(0);
    expect((await core.summariesLeftToday(member)).left).toBe(10);
  });

  it("tells the engine what the file really is, not what the browser said", async () => {
    const { core, engine, uploads } = setup();
    const started = await core.startUpload(member, clip);
    if (started.status !== "ready") throw new Error("couldn't start");
    const mov = new Uint8Array([0, 0, 0, 0x14, ...new TextEncoder().encode("ftypqt  "), 0, 0, 0, 0]);
    uploads.put(`m-1/${started.uploadId}`, { bytes: mov, mimeType: "application/octet-stream" });

    await core.summarizeUpload(member, started.uploadId);

    expect(engine.fileCalls[0]?.mimeType).toBe("video/mov");
  });
});

describe("summarizing an Upload", () => {
  it("returns the Summary already made, without counting again, if asked twice", async () => {
    const { core, engine, uploads, upload } = setup();
    const id = await upload();
    const first = await core.summarizeUpload(member, id);
    uploads.put(`m-1/${id}`); // The same short-lived URL used again.

    const second = await core.summarizeUpload(member, id);

    expect(second).toEqual(first);
    expect(engine.fileCalls).toHaveLength(1);
    expect(uploads.files.size).toBe(0);
    expect((await core.summariesLeftToday(member)).left).toBe(9);
  });

  it("deletes the file when a Storage error stops it being read", async () => {
    const { core, uploads, upload } = setup();
    const id = await upload();
    uploads.read = async () => {
      throw new Error("storage hiccup");
    };

    expect(await core.summarizeUpload(member, id)).toEqual({ status: "rejected", reason: "summary-failed" });
    expect(uploads.removed).toEqual([`m-1/${id}`]);
  });

  it("makes a Summary only its owner can see, then deletes the file", async () => {
    const { core, engine, uploads, upload } = setup();
    const id = await upload();

    const result = await core.summarizeUpload(member, id);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary).toMatchObject({ videoId: id, language: "english", ownerId: "m-1" });
    expect(engine.fileCalls).toHaveLength(1);
    expect(uploads.files.size).toBe(0);
    expect(uploads.removed).toEqual([`m-1/${id}`]);
  });

  it("is in the owner's History", async () => {
    const { core, upload } = setup();
    const id = await upload();
    await core.summarizeUpload(member, id);

    expect((await core.listHistory("m-1")).map((e) => e.videoId)).toEqual([id]);
  });

  it("counts toward the Member's 10 new Summaries a day", async () => {
    const { core, upload } = setup();
    await core.summarizeUpload(member, await upload());

    expect((await core.summariesLeftToday(member)).left).toBe(9);
  });

  it("deletes the file and counts nothing when summarizing fails", async () => {
    const { core, engine, uploads, upload } = setup();
    engine.failFiles = true;
    const id = await upload();

    expect(await core.summarizeUpload(member, id)).toEqual({ status: "rejected", reason: "summary-failed" });
    expect(uploads.files.size).toBe(0);
    expect((await core.summariesLeftToday(member)).left).toBe(10);
  });

  it("refuses a video the engine finds is over 30 minutes, deleting it and counting nothing", async () => {
    const { core, engine, uploads, upload } = setup();
    engine.fileDurationSeconds = 31 * 60;
    const id = await upload();

    expect(await core.summarizeUpload(member, id)).toEqual({
      status: "rejected",
      reason: "video-too-long",
      limitMinutes: 30,
    });
    expect(uploads.files.size).toBe(0);
    expect((await core.summariesLeftToday(member)).left).toBe(10);
  });

  it("can't reach another Member's file", async () => {
    const { core, engine, uploads, upload } = setup();
    const id = await upload(member);

    expect(await core.summarizeUpload(otherMember, id)).toEqual({ status: "rejected", reason: "upload-not-found" });
    expect(engine.fileCalls).toEqual([]);
    expect(uploads.files.size).toBe(1);
  });
});

describe("reading an Upload Summary", () => {
  it("is only for its owner, and never through a share link", async () => {
    const { core, upload } = setup();
    const id = await upload();
    const made = await core.summarizeUpload(member, id);

    expect(await core.readUploadSummary(member, id)).toEqual({
      summary: made.status === "ready" && made.summary,
      translationFailed: false,
    });
    expect(await core.readUploadSummary(otherMember, id)).toBeNull();
    expect(await core.readUploadSummary(guest, id)).toBeNull();
    expect(await core.readSharedSummary(id)).toBeNull();
  });

  it("comes in the original language too, for its owner only", async () => {
    const { core, translator, upload } = setup();
    const id = await upload();
    await core.summarizeUpload(member, id);

    const korean = await core.readUploadSummary(member, id, "original");
    expect(korean?.summary).toMatchObject({ language: "original", ownerId: "m-1" });
    expect(korean?.translationFailed).toBe(false);
    expect(translator.calls).toEqual(["ko"]);
    expect(await core.readUploadSummary(otherMember, id, "original")).toBeNull();
  });

  it("is never read in a Natural voice, since that audio is public", async () => {
    const { core, voice, upload } = setup();
    const id = await upload();
    await core.summarizeUpload(member, id);

    expect(await core.requestNarration({ videoId: id, language: "english", length: "short", requester: member })).toEqual({
      voice: "standard",
      reason: "upload-not-eligible",
    });
    expect(voice.calls).toEqual([]);
  });
});

describe("abandoned Uploads", () => {
  it("are swept away after an hour, if nobody asked to summarize them", async () => {
    const { core, uploads } = setup();
    uploads.put("m-1/upload-old", undefined, "2026-11-12T08:30:00.000Z");
    uploads.put("m-2/upload-recent", undefined, "2026-11-12T09:30:00.000Z");

    // The clock says 10:00.
    expect(await core.sweepAbandonedUploads()).toBe(1);
    expect([...uploads.files.keys()]).toEqual(["m-2/upload-recent"]);
  });
});
