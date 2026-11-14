import { describe, expect, it } from "vitest";
import { createCore } from "./core";
import type { Requester } from "./requester";
import {
  ControllableClock,
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
  validEngineOutput,
} from "./testing";

const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };
const otherGuest: Requester = { kind: "guest", guestId: "g-2", ipHash: "ip-2" };
const sameNetworkGuest: Requester = { kind: "guest", guestId: "g-3", ipHash: "ip-1" };
const member: Requester = { kind: "member", memberId: "m-1" };
const clip = { sizeBytes: 5_000_000, durationSeconds: 45, mimeType: "video/mp4" };

function setup() {
  const engine = new FakeSummaryEngine(() => validEngineOutput("ko"));
  const translator = new FakeTranslator();
  const uploads = new InMemoryUploadStorage();
  const store = new InMemorySummaryStore();
  const history = new InMemoryHistoryStore();
  const clock = new ControllableClock("2026-11-12T10:00:00.000Z");
  let n = 0;
  const core = createCore({
    engine,
    translator,
    catalog: new FakeVideoCatalog(),
    summaryLanguages: ["es"],
    store,
    usage: new InMemoryUsageCounters(),
    members: new InMemoryMemberStore(),
    history,
    voice: new FakeNaturalVoice(),
    narrationAudio: new InMemoryNarrationAudioStore(),
    uploads,
    clock,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  /** Starts an Upload and does what the browser does: puts the file at the URL. */
  const upload = async (requester: Requester) => {
    const started = await core.startUpload(requester, clip);
    if (started.status !== "ready") throw new Error(`couldn't start: ${started.reason}`);
    uploads.put(new URL(started.uploadUrl).pathname.slice(1));
    return started.uploadId;
  };
  const summarized = async (requester: Requester) => {
    const id = await upload(requester);
    const result = await core.summarizeUpload(requester, id);
    if (result.status !== "ready") throw new Error(`couldn't summarize: ${result.reason}`);
    return id;
  };
  return { core, engine, uploads, store, history, clock, upload, summarized };
}

describe("a Guest's Upload", () => {
  it("waits in the Guest's own private folder", async () => {
    const { core } = setup();
    expect(await core.startUpload(guest, clip)).toEqual({
      status: "ready",
      uploadId: "upload-00000000-0000-4000-8000-000000000001",
      uploadUrl: "https://uploads.test/guest-g-1/upload-00000000-0000-4000-8000-000000000001?token=one-time",
    });
  });

  it("makes a Summary only that Guest can read, and deletes the file", async () => {
    const { core, uploads, history, summarized } = setup();
    const id = await summarized(guest);

    expect(await core.readUploadSummary(guest, id)).toMatchObject({
      summary: { videoId: id, ownerId: "guest-g-1" },
    });
    expect(uploads.files.size).toBe(0);
    // Guests have no History.
    expect(await history.listHistory("g-1", 50)).toEqual([]);
  });

  it("can't be read by anyone else: another Guest, a Member, or through a share link", async () => {
    const { core, summarized } = setup();
    const id = await summarized(guest);

    expect(await core.readUploadSummary(otherGuest, id)).toBeNull();
    expect(await core.readUploadSummary(sameNetworkGuest, id)).toBeNull();
    expect(await core.readUploadSummary(member, id)).toBeNull();
    expect(await core.readSharedSummary(id)).toBeNull();
  });

  it("can't be summarized by anyone else", async () => {
    const { core, engine, upload } = setup();
    const id = await upload(guest);

    expect(await core.summarizeUpload(otherGuest, id)).toEqual({ status: "rejected", reason: "upload-not-found" });
    expect(engine.fileCalls).toHaveLength(0);
  });

  it("counts toward the Guest's 3 a day, once, only when it works", async () => {
    const { core, engine, upload, summarized } = setup();
    await summarized(guest);
    expect((await core.summariesLeftToday(guest)).left).toBe(2);

    engine.failFiles = true;
    const failing = await upload(guest);
    expect((await core.summarizeUpload(guest, failing)).status).toBe("rejected");
    engine.failFiles = false;
    expect((await core.summariesLeftToday(guest)).left).toBe(2);
  });

  it("is turned away before uploading once the Guest has none left today", async () => {
    const { core, summarized } = setup();
    for (let i = 0; i < 3; i++) await summarized(guest);

    expect(await core.startUpload(guest, clip)).toMatchObject({
      status: "rejected",
      reason: "daily-limit-reached",
      memberDailyLimit: 10,
    });
  });

  it("also counts toward the Guest's network, so new cookies don't mean new Summaries", async () => {
    const { core, summarized } = setup();
    // The per-network cap is 10: three cookies' worth, and a bit.
    for (const guestId of ["a", "b", "c"]) {
      for (let i = 0; i < 3; i++) await summarized({ kind: "guest", guestId, ipHash: "ip-1" });
    }
    await summarized({ kind: "guest", guestId: "d", ipHash: "ip-1" });

    expect(await core.startUpload({ kind: "guest", guestId: "e", ipHash: "ip-1" }, clip)).toMatchObject({
      status: "rejected",
      reason: "daily-limit-reached",
    });
  });

  it("has the Guest's 15-minute limit, saying Members get 30", async () => {
    const { core } = setup();
    expect(await core.startUpload(guest, { ...clip, durationSeconds: 16 * 60 })).toEqual({
      status: "rejected",
      reason: "video-too-long",
      limitMinutes: 15,
      memberLimitMinutes: 30,
    });
  });

  it("comes in the original language for its Guest, but other languages stay Members-only", async () => {
    const { core, summarized } = setup();
    const id = await summarized(guest);

    expect(await core.readUploadSummary(guest, id, "original")).toMatchObject({
      summary: { language: "original", ownerId: "guest-g-1" },
      translationFailed: false,
    });
    expect(await core.readUploadSummary(guest, id, "es")).toMatchObject({
      summary: { language: "english" },
      translationFailed: true,
    });
    expect(await core.readUploadSummary(otherGuest, id, "original")).toBeNull();
  });

  it("is never read in a Natural voice", async () => {
    const { core, summarized } = setup();
    const id = await summarized(guest);
    expect(await core.requestNarration({ requester: guest, videoId: id, language: "english", length: "medium" })).toMatchObject({
      voice: "standard",
    });
  });
});

describe("clearing out Guests' Upload Summaries", () => {
  it("deletes them, in every language, 30 days after they were made", async () => {
    const { core, clock, summarized } = setup();
    const old = await summarized(guest);
    await core.readUploadSummary(guest, old, "original");
    clock.set("2026-12-02T10:00:00.000Z");
    const recent = await summarized(otherGuest);
    const members = await summarized(member);
    clock.set("2026-12-13T10:00:00.000Z");

    expect(await core.sweepOldGuestUploads()).toBe(1);

    expect(await core.readUploadSummary(guest, old)).toBeNull();
    expect(await core.readUploadSummary(guest, old, "original")).toBeNull();
    expect(await core.readUploadSummary(otherGuest, recent)).not.toBeNull();
    // Members' Uploads stay until they delete their account.
    expect(await core.readUploadSummary(member, members)).not.toBeNull();
  });
});
