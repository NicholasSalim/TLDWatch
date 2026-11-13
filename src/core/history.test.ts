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
  InMemoryUsageCounters,
  validEngineOutput,
} from "./testing";

const A = "videoAAAAAA";
const B = "videoBBBBBB";
const url = (id: string) => `https://youtu.be/${id}`;
const member: Requester = { kind: "member", memberId: "m-1" };
const otherMember: Requester = { kind: "member", memberId: "m-2" };
const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };

function setup() {
  const clock = new ControllableClock("2026-11-13T10:00:00.000Z");
  const engine = new FakeSummaryEngine((id) => validEngineOutput(id === B ? "ko" : "en"));
  const core = createCore({
    engine,
    translator: new FakeTranslator(),
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(), voice: new FakeNaturalVoice(), narrationAudio: new InMemoryNarrationAudioStore(),
    clock,
  });
  return { core, clock, engine };
}

describe("History", () => {
  it("lists a Summary a Member opened, with a short preview", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: member });

    expect(await core.listHistory("m-1")).toEqual([
      {
        videoId: A,
        language: "english",
        openedAt: "2026-11-13T10:00:00.000Z",
        preview: "A short overview of the video.",
      },
    ]);
  });

  it("includes Summaries someone else made first", async () => {
    const { core, engine } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: otherMember });

    await core.requestSummary({ videoUrl: url(A), requester: member });

    expect(engine.calls).toEqual([A]);
    expect((await core.listHistory("m-1")).map((e) => e.videoId)).toEqual([A]);
  });

  it("lists newest first, and moves a Summary opened again to the top", async () => {
    const { core, clock } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: member });
    clock.set("2026-11-13T11:00:00.000Z");
    await core.requestSummary({ videoUrl: url(B), requester: member });
    expect((await core.listHistory("m-1")).map((e) => e.videoId)).toEqual([B, A]);

    clock.set("2026-11-13T12:00:00.000Z");
    await core.requestSummary({ videoUrl: url(A), requester: member });

    const history = await core.listHistory("m-1");
    expect(history.map((e) => e.videoId)).toEqual([A, B]);
    expect(history[0].openedAt).toBe("2026-11-13T12:00:00.000Z");
  });

  it("keeps one entry per video, remembering the language last opened", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(B), requester: member });
    await core.requestSummary({ videoUrl: url(B), requester: member, language: "original" });

    const history = await core.listHistory("m-1");
    expect(history).toHaveLength(1);
    expect(history[0].language).toBe("original");
    expect(history[0].preview).toBe("[ko] A short overview of the video.");
  });

  it("records a Summary a Member opens from a share link", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: guest });

    await core.recordOpened(member, A, "english");

    expect((await core.listHistory("m-1")).map((e) => e.videoId)).toEqual([A]);
  });

  it("records nothing for Guests, for Summaries that don't exist, or for refused requests", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: guest });
    await core.recordOpened(guest, A, "english");
    await core.recordOpened(member, "nosuchvideo", "english");
    await core.requestSummary({ videoUrl: "https://www.tiktok.com/@x/video/1", requester: member });

    expect(await core.listHistory("m-1")).toEqual([]);
  });

  it("lets a Member remove an entry, leaving the others", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: member });
    await core.requestSummary({ videoUrl: url(B), requester: member });

    await core.removeFromHistory("m-1", A);

    expect((await core.listHistory("m-1")).map((e) => e.videoId)).toEqual([B]);
  });

  it("pages through older entries, so every Summary opened can be found", async () => {
    // More than a day's worth of new Summaries, so set them up directly.
    const store = new InMemorySummaryStore();
    const history = new InMemoryHistoryStore();
    const core = createCore({
      engine: new FakeSummaryEngine(),
      translator: new FakeTranslator(),
      catalog: new FakeVideoCatalog(),
      store,
      usage: new InMemoryUsageCounters(),
      members: new InMemoryMemberStore(),
      history,
      voice: new FakeNaturalVoice(),
      narrationAudio: new InMemoryNarrationAudioStore(),
      clock: new ControllableClock(),
    });
    const videos = Array.from({ length: 53 }, (_, i) => `video${String(i).padStart(6, "0")}`);
    for (const [i, v] of videos.entries()) {
      const openedAt = new Date(Date.UTC(2026, 10, 13, 10, i)).toISOString();
      const { lengths, spokenLanguage } = validEngineOutput();
      await store.saveSummary({ videoId: v, language: "english", spokenLanguage, lengths, createdAt: openedAt });
      await history.recordOpened({ memberId: "m-1", videoId: v, language: "english", openedAt });
    }

    const first = await core.listHistory("m-1");
    const older = await core.listHistory("m-1", { before: first.at(-1)!.openedAt });

    expect(first).toHaveLength(50);
    expect(first[0].videoId).toBe(videos[52]);
    expect(older.map((e) => e.videoId)).toEqual([videos[2], videos[1], videos[0]]);
  });

  it("shows the English Summary when the original-language one is gone", async () => {
    const store = new InMemorySummaryStore();
    const history = new InMemoryHistoryStore();
    const core = createCore({
      engine: new FakeSummaryEngine(() => validEngineOutput("ko")),
      translator: new FakeTranslator(),
      catalog: new FakeVideoCatalog(),
      store,
      usage: new InMemoryUsageCounters(),
      members: new InMemoryMemberStore(),
      history,
      voice: new FakeNaturalVoice(),
      narrationAudio: new InMemoryNarrationAudioStore(),
      clock: new ControllableClock(),
    });
    await core.requestSummary({ videoUrl: url(B), requester: member });
    await history.recordOpened({ memberId: "m-1", videoId: B, language: "original", openedAt: "2026-11-13T11:00:00.000Z" });

    const [item] = await core.listHistory("m-1");

    expect(item.language).toBe("english");
    expect(item.preview).toBe("A short overview of the video.");
  });

  it("forgets an entry whose Summary no longer exists", async () => {
    const history = new InMemoryHistoryStore();
    const core = createCore({
      engine: new FakeSummaryEngine(),
      translator: new FakeTranslator(),
      catalog: new FakeVideoCatalog(),
      store: new InMemorySummaryStore(),
      usage: new InMemoryUsageCounters(),
      members: new InMemoryMemberStore(),
      history,
      voice: new FakeNaturalVoice(),
      narrationAudio: new InMemoryNarrationAudioStore(),
      clock: new ControllableClock(),
    });
    await history.recordOpened({ memberId: "m-1", videoId: A, language: "english", openedAt: "2026-11-13T10:00:00.000Z" });

    expect(await core.listHistory("m-1")).toEqual([]);
    expect(await history.listHistory("m-1", 50)).toEqual([]);
  });

  it("keeps each Member's History separate", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(A), requester: member });

    expect(await core.listHistory("m-2")).toEqual([]);
  });
});
