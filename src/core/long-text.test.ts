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
const otherGuest: Requester = { kind: "guest", guestId: "g-2", ipHash: "ip-2" };
const article = "Cities are planting trees to cool their streets. ".repeat(40);

function setup() {
  const engine = new FakeSummaryEngine(() => validEngineOutput("id"));
  const translator = new FakeTranslator();
  const usage = new InMemoryUsageCounters();
  let n = 0;
  const core = createCore({
    engine,
    translator,
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage,
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(),
    voice: new FakeNaturalVoice(),
    narrationAudio: new InMemoryNarrationAudioStore(),
    uploads: new InMemoryUploadStorage(),
    clock: fixedClock(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  });
  return { core, engine, translator, usage };
}

describe("summarizing a long text", () => {
  it("reads only the text, in one engine call, and keeps the Summary private to whoever pasted it", async () => {
    const { core, engine } = setup();

    const result = await core.summarizeText(guest, article);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(engine.textCalls).toEqual([article.trim()]);
    expect(engine.calls).toEqual([]);
    expect(engine.fileCalls).toEqual([]);
    expect(result.summary).toMatchObject({
      videoId: "upload-00000000-0000-4000-8000-000000000001",
      language: "english",
      spokenLanguage: "id",
      source: "text",
      ownerId: "guest-g-1",
    });
    expect(await core.readUploadSummary(guest, result.summary.videoId)).not.toBeNull();
    expect(await core.readUploadSummary(otherGuest, result.summary.videoId)).toBeNull();
    expect(await core.readSharedSummary(result.summary.videoId)).toBeNull();
  });

  it("has no Timestamps, even if the engine makes some up", async () => {
    const { core } = setup();
    const result = await core.summarizeText(member, article);
    if (result.status !== "ready") throw new Error("not ready");
    for (const length of ["short", "medium", "detailed"] as const) {
      expect(result.summary.lengths[length].timestamps).toEqual([]);
      expect(result.summary.lengths[length].keyPoints.length).toBeGreaterThan(0);
    }
  });

  it("is in a Member's History", async () => {
    const { core } = setup();
    const result = await core.summarizeText(member, article);
    if (result.status !== "ready") throw new Error("not ready");
    expect(await core.listHistory("m-1")).toMatchObject([{ videoId: result.summary.videoId, source: "text" }]);
  });

  it("counts toward the daily limit once, and never the video-minutes budget", async () => {
    const { core, usage } = setup();
    await core.summarizeText(guest, article);

    expect((await core.summariesLeftToday(guest)).left).toBe(2);
    expect(await usage.used("app:video-minutes", "2026-11-12")).toBe(0);
  });

  it("counts nothing when summarizing fails, or the engine's answer is malformed", async () => {
    const { core, engine } = setup();
    engine.failText = true;
    expect(await core.summarizeText(guest, article)).toEqual({ status: "rejected", reason: "summary-failed" });

    engine.failText = false;
    engine.respond = () => ({ nonsense: true });
    expect(await core.summarizeText(guest, article)).toEqual({ status: "rejected", reason: "summary-failed" });

    expect((await core.summariesLeftToday(guest)).left).toBe(3);
  });

  it("is turned away once the Guest has none left today, before the engine is asked", async () => {
    const { core, engine } = setup();
    for (let i = 0; i < 3; i++) await core.summarizeText(guest, article);

    expect(await core.summarizeText(guest, article)).toMatchObject({
      status: "rejected",
      reason: "daily-limit-reached",
      memberDailyLimit: 10,
    });
    expect(engine.textCalls).toHaveLength(3);
  });

  it.each([
    ["empty", "   \n  ", { reason: "empty" }],
    ["over 100,000 characters", "x".repeat(100_001), { reason: "text-too-long", limitCharacters: 100_000 }],
  ])("refuses a text that's %s without asking the engine", async (_, text, rejection) => {
    const { core, engine } = setup();
    expect(await core.summarizeText(guest, text)).toEqual({ status: "rejected", ...rejection });
    expect(engine.textCalls).toEqual([]);
  });

  it("comes in the language it was written in, translated once, for its owner", async () => {
    const { core, translator } = setup();
    const result = await core.summarizeText(guest, article);
    if (result.status !== "ready") throw new Error("not ready");

    const original = await core.readUploadSummary(guest, result.summary.videoId, "original");
    expect(original).toMatchObject({ summary: { language: "original", source: "text" }, translationFailed: false });
    expect(translator.calls).toHaveLength(1);
  });

  it("is read in the Standard voice only, since it's private", async () => {
    const { core } = setup();
    const result = await core.summarizeText(member, article);
    if (result.status !== "ready") throw new Error("not ready");
    expect(
      await core.requestNarration({ requester: member, videoId: result.summary.videoId, language: "english", length: "short" }),
    ).toEqual({ voice: "standard", reason: "upload-not-eligible" });
  });
});
