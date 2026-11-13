import { describe, expect, it, vi } from "vitest";
import { createCore } from "./core";
import type { Requester } from "./requester";
import {
  FakeSummaryEngine,
  FakeTranslator,
  FakeVideoCatalog,
  InMemoryMemberStore,
  InMemorySummaryStore,
  InMemoryUsageCounters,
  fakeTranslation,
  fixedClock,
  validEngineOutput,
} from "./testing";

const ID = "dQw4w9WgXcQ";
const guest: Requester = { kind: "guest", guestId: "guest-1", ipHash: "ip-1" };

function setup(spokenLanguage = "ko") {
  const engine = new FakeSummaryEngine(() => validEngineOutput(spokenLanguage));
  const translator = new FakeTranslator();
  const core = createCore({
    engine,
    translator,
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(), members: new InMemoryMemberStore(),
    clock: fixedClock(),
  });
  return { core, engine, translator };
}

describe("original-language Summaries", () => {
  it("translates the English Summary into the spoken language, without reading the video again", async () => {
    const { core, engine, translator } = setup("ko");

    const result = await core.requestSummary({
      videoUrl: `https://youtu.be/${ID}`,
      requester: guest,
      language: "original",
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary.language).toBe("original");
    expect(result.summary.spokenLanguage).toBe("ko");
    expect(result.summary.lengths.medium.overview).toBe("[ko] A medium overview of the video.");
    expect(result.summary.lengths.medium.timestamps[1]).toEqual({
      seconds: 95,
      label: "[ko] The main argument",
    });
    expect(engine.calls).toEqual([ID]);
    expect(translator.calls).toEqual(["ko"]);
  });

  it("stores the translation and reuses it, however the link is written", async () => {
    const { core, engine, translator } = setup("ko");
    const first = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });
    const second = await core.requestSummary({
      videoUrl: `https://www.youtube.com/watch?v=${ID}`,
      requester: guest,
      language: "original",
    });

    expect(second).toEqual(first);
    expect(engine.calls).toEqual([ID]);
    expect(translator.calls).toEqual(["ko"]);
  });

  it("shares one translation between simultaneous requests", async () => {
    const { core, translator } = setup("ko");
    await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest });
    translator.manual = true;

    const requests = [1, 2, 3].map(() =>
      core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" }),
    );
    await vi.waitFor(() => expect(translator.calls).toHaveLength(1));
    translator.finish();
    const results = await Promise.all(requests);

    expect(results.every((r) => r.status === "ready")).toBe(true);
    expect(translator.calls).toEqual(["ko"]);
  });

  it.each(["en", "en-GB"])("gives the English Summary for a video spoken in %s, without translating", async (spoken) => {
    const { core, translator } = setup(spoken);

    const result = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });

    expect(result.status === "ready" && result.summary.language).toBe("english");
    expect(translator.calls).toEqual([]);
  });

  it.each([
    ["a malformed translation", () => ({ medium: { overview: "only one" } })],
    [
      "a translation that drops a key point",
      () => {
        const lengths = validEngineOutput().lengths;
        return { ...lengths, short: { ...lengths.short, keyPoints: ["just one"] } };
      },
    ],
  ])("refuses %s, stores nothing, and tries again next time", async (_, broken) => {
    const { core, translator } = setup("ko");
    translator.respond = broken;
    const request = { videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" } as const;

    const failed = await core.requestSummary(request);
    expect(failed.status === "ready" && failed.translationFailed).toBe(true);

    translator.respond = fakeTranslation;
    expect((await core.requestSummary(request)).status).toBe("ready");
    expect(translator.calls).toEqual(["ko", "ko"]);
  });

  it("falls back to the English Summary, with a note, when translating a new video fails", async () => {
    const { core, translator } = setup("ko");
    translator.respond = () => ({ broken: true });

    const result = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary.language).toBe("english");
    expect(result.translationFailed).toBe(true);
  });

  it("gives up on a translation that takes too long, and falls back to English", async () => {
    vi.useFakeTimers();
    try {
      const translator = new FakeTranslator();
      translator.manual = true;
      const core = createCore({
        engine: new FakeSummaryEngine(() => validEngineOutput("ko")),
        translator,
        catalog: new FakeVideoCatalog(),
        store: new InMemorySummaryStore(),
        usage: new InMemoryUsageCounters(), members: new InMemoryMemberStore(),
        clock: fixedClock(),
        translationTimeoutMs: 20_000,
      });

      const pending = core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });
      await vi.advanceTimersByTimeAsync(20_000);
      const result = await pending;

      expect(result.status === "ready" && result.summary.language).toBe("english");
      expect(result.status === "ready" && result.translationFailed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps Timestamp seconds and Verdict answers from the English Summary, whatever the translation says", async () => {
    const { core, translator } = setup("ko");
    translator.respond = (lengths, target) => {
      const t = fakeTranslation(lengths, target) as typeof lengths;
      t.medium.timestamps[0].seconds = 999;
      t.medium.verdict.worthWatching = false;
      return t;
    };

    const result = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });

    if (result.status !== "ready") throw new Error("expected a Summary");
    expect(result.summary.lengths.medium.timestamps[0].seconds).toBe(0);
    expect(result.summary.lengths.medium.verdict.worthWatching).toBe(true);
  });

  it("doesn't count a translation against the daily limit", async () => {
    const { core } = setup("ko");
    const videos = ["videoA00000", "videoB00000", "videoC00000"];
    for (const v of videos) await core.requestSummary({ videoUrl: `https://youtu.be/${v}`, requester: guest });
    expect((await core.summariesLeftToday(guest)).left).toBe(0);

    for (const v of videos) {
      const result = await core.requestSummary({ videoUrl: `https://youtu.be/${v}`, requester: guest, language: "original" });
      expect(result.status).toBe("ready");
    }
  });

  it("opens the original-language Summary from a share link, and never translates there", async () => {
    const { core, translator } = setup("ko");
    await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest });
    expect(await core.readSharedSummary(ID, "original")).toBeNull();
    expect(translator.calls).toEqual([]);

    const made = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest, language: "original" });
    expect(await core.readSharedSummary(ID, "original")).toEqual(made.status === "ready" && made.summary);
  });
});
