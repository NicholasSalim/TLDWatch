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

const SHARED = "videoSHARED";
const member: Requester = { kind: "member", memberId: "m-1" };
const otherMember: Requester = { kind: "member", memberId: "m-2" };
const clip = { sizeBytes: 1_000, durationSeconds: 30, mimeType: "video/mp4" };

function setup() {
  const store = new InMemorySummaryStore();
  const history = new InMemoryHistoryStore();
  const members = new InMemoryMemberStore();
  const uploads = new InMemoryUploadStorage();
  const narrationAudio = new InMemoryNarrationAudioStore();
  const usage = new InMemoryUsageCounters();
  let n = 0;
  const core = createCore({
    engine: new FakeSummaryEngine(() => validEngineOutput("ko")),
    translator: new FakeTranslator(),
    catalog: new FakeVideoCatalog(),
    store,
    usage,
    members,
    history,
    voice: new FakeNaturalVoice(),
    narrationAudio,
    uploads,
    clock: fixedClock(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });

  /** A Member with an autoplay setting, a shared YouTube Summary with Natural voice audio, and an Upload. */
  const busyMember = async (requester: Requester & { kind: "member" }) => {
    await core.joinAsMember({ memberId: requester.memberId, confirmedAdult: true });
    await core.setMemberAutoplay(requester.memberId, true);
    await core.requestSummary({ videoUrl: `https://youtu.be/${SHARED}`, requester });
    await core.requestNarration({ videoId: SHARED, language: "english", length: "short", requester });
    const started = await core.startUpload(requester, clip);
    if (started.status !== "ready") throw new Error("couldn't start an Upload");
    uploads.put(`${requester.memberId}/${started.uploadId}`);
    await core.summarizeUpload(requester, started.uploadId);
    await core.readUploadSummary(requester, started.uploadId, "original");
    // One more file uploaded but not yet summarized.
    const waiting = await core.startUpload(requester, clip);
    if (waiting.status === "ready") uploads.put(`${requester.memberId}/${waiting.uploadId}`);
    return started.uploadId;
  };

  return { core, store, history, members, uploads, narrationAudio, usage, busyMember };
}

describe("deleting a Member", () => {
  it("deletes their profile and settings, History, Upload Summaries and waiting files", async () => {
    const { core, store, uploads, busyMember } = setup();
    const uploadId = await busyMember(member);

    await core.deleteMember("m-1");

    expect(await core.memberSettings("m-1")).toBeNull();
    expect(await core.listHistory("m-1")).toEqual([]);
    expect(await store.findSummary(uploadId, "english")).toBeNull();
    expect(await store.findSummary(uploadId, "original")).toBeNull();
    expect([...uploads.files.keys()].filter((p) => p.startsWith("m-1/"))).toEqual([]);
  });

  it("forgets their daily usage counts too", async () => {
    const { core, usage, busyMember } = setup();
    await busyMember(member);

    await core.deleteMember("m-1");

    expect(await usage.used("member:m-1", "2026-11-12")).toBe(0);
  });

  it("can be run again safely, to finish a deletion that stopped partway", async () => {
    const { core, busyMember } = setup();
    await busyMember(member);
    await core.deleteMember("m-1");

    await expect(core.deleteMember("m-1")).resolves.toBeUndefined();
  });

  it("keeps shared YouTube Summaries and their Natural voice audio, so share links still work", async () => {
    const { core, narrationAudio, busyMember } = setup();
    await busyMember(member);
    const audioBefore = narrationAudio.audio.size;

    await core.deleteMember("m-1");

    expect(await core.readSharedSummary(SHARED)).toMatchObject({ videoId: SHARED, language: "english" });
    expect(narrationAudio.audio.size).toBe(audioBefore);
    expect(audioBefore).toBeGreaterThan(0);
  });

  it("leaves every other Member as they were", async () => {
    const { core, busyMember } = setup();
    await busyMember(member);
    const theirUpload = await busyMember(otherMember);

    await core.deleteMember("m-1");

    expect(await core.memberSettings("m-2")).toEqual({ autoplay: true });
    expect((await core.listHistory("m-2")).length).toBe(2);
    expect(await core.readUploadSummary(otherMember, theirUpload)).not.toBeNull();
  });
});
