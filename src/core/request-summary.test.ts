import { describe, expect, it, vi } from "vitest";
import { createCore } from "./core";
import { FakeSummaryEngine, InMemorySummaryStore, fixedClock, validEngineOutput } from "./testing";

const ID = "dQw4w9WgXcQ";

function setup(engine = new FakeSummaryEngine()) {
  const store = new InMemorySummaryStore();
  const core = createCore({ engine, store, clock: fixedClock() });
  return { core, engine, store };
}

describe("requestSummary", () => {
  it("returns an English Summary with all three Lengths for a YouTube Video URL", async () => {
    const { core } = setup();

    const result = await core.requestSummary({ videoUrl: `https://www.youtube.com/watch?v=${ID}` });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary.videoId).toBe(ID);
    expect(result.summary.language).toBe("english");
    expect(result.summary.spokenLanguage).toBe("en");
    expect(result.summary.lengths.medium.overview).toBe("A medium overview of the video.");
    expect(Object.keys(result.summary.lengths).sort()).toEqual(["detailed", "medium", "short"]);
  });

  it("reads a video once, however its link is written, and reuses the stored Summary", async () => {
    const { core, engine } = setup();

    const first = await core.requestSummary({ videoUrl: `https://www.youtube.com/watch?v=${ID}` });
    const second = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}?si=abc` });
    const third = await core.requestSummary({ videoUrl: `https://www.youtube.com/shorts/${ID}` });

    expect(engine.calls).toEqual([ID]);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("shares one in-flight generation between simultaneous requests for the same video", async () => {
    const engine = new FakeSummaryEngine(undefined, { manual: true });
    const { core } = setup(engine);

    const requests = [
      core.requestSummary({ videoUrl: `https://www.youtube.com/watch?v=${ID}` }),
      core.requestSummary({ videoUrl: `https://m.youtube.com/watch?v=${ID}` }),
      core.requestSummary({ videoUrl: `youtu.be/${ID}` }),
    ];
    await vi.waitFor(() => expect(engine.calls.length).toBeGreaterThan(0));
    engine.finish();
    const results = await Promise.all(requests);

    expect(engine.calls).toEqual([ID]);
    expect(results.every((r) => r.status === "ready")).toBe(true);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("doesn't read the video again when a request's store lookup is slower than another's generation", async () => {
    const engine = new FakeSummaryEngine(undefined, { manual: true });
    const store = new InMemorySummaryStore();
    let releaseSlowLookup = () => {};
    let lookups = 0;
    const slowFirstLookups: typeof store = Object.create(store);
    slowFirstLookups.findSummary = async (videoId, language) => {
      lookups += 1;
      // The second request's lookup starts before anything is stored and answers late, stale.
      if (lookups === 2) {
        await new Promise<void>((resolve) => (releaseSlowLookup = resolve));
        return null;
      }
      return store.findSummary(videoId, language);
    };
    const core = createCore({ engine, store: slowFirstLookups, clock: fixedClock() });

    const first = core.requestSummary({ videoUrl: `https://youtu.be/${ID}` });
    const second = core.requestSummary({ videoUrl: `https://youtu.be/${ID}` });
    await vi.waitFor(() => expect(engine.calls.length).toBe(1));
    engine.finish();
    await first;
    engine.manual = false;
    releaseSlowLookup();

    expect((await second).status).toBe("ready");
    expect(engine.calls).toEqual([ID]);
  });

  it("turns a Store error into summary-failed", async () => {
    const store = new InMemorySummaryStore();
    store.findSummary = async () => {
      throw new Error("database unreachable");
    };
    const core = createCore({ engine: new FakeSummaryEngine(), store, clock: fixedClock() });

    expect(await core.requestSummary({ videoUrl: `https://youtu.be/${ID}` })).toEqual({
      status: "rejected",
      reason: "summary-failed",
    });
  });

  it.each([
    ["   ", "empty"],
    ["summarize this please", "not-a-url"],
    ["https://www.tiktok.com/@someone/video/7300000000000000000", "not-youtube"],
    ["https://www.youtube.com/@somechannel", "no-video-id"],
  ])("rejects %j as %s without reading anything", async (videoUrl, reason) => {
    const { core, engine } = setup();

    expect(await core.requestSummary({ videoUrl })).toEqual({ status: "rejected", reason });
    expect(engine.calls).toEqual([]);
  });

  it("refuses engine output that doesn't match the schema, and stores nothing", async () => {
    const malformed = { spokenLanguage: "en", lengths: { medium: { overview: "Only one Length" } } };
    let output: unknown = malformed;
    const engine = new FakeSummaryEngine(() => output);
    const { core } = setup(engine);
    const request = { videoUrl: `https://youtu.be/${ID}` };

    expect(await core.requestSummary(request)).toEqual({ status: "rejected", reason: "summary-failed" });

    output = validEngineOutput();
    const retry = await core.requestSummary(request);
    expect(retry.status).toBe("ready");
    expect(engine.calls).toEqual([ID, ID]);
  });

  it("turns an engine error into summary-failed for everyone waiting on it", async () => {
    const engine = new FakeSummaryEngine(
      () => {
        throw new Error("quota exceeded");
      },
      { manual: true },
    );
    const { core } = setup(engine);

    const requests = [
      core.requestSummary({ videoUrl: `https://youtu.be/${ID}` }),
      core.requestSummary({ videoUrl: `https://youtu.be/${ID}` }),
    ];
    await vi.waitFor(() => expect(engine.calls.length).toBeGreaterThan(0));
    engine.finish();

    expect(await Promise.all(requests)).toEqual([
      { status: "rejected", reason: "summary-failed" },
      { status: "rejected", reason: "summary-failed" },
    ]);
    expect(engine.calls).toEqual([ID]);
  });
});
