import { describe, expect, it, vi } from "vitest";
import { createCore, type UsageLimits } from "./core";
import type { Requester } from "./requester";
import {
  ControllableClock,
  FakeSummaryEngine,
  FakeVideoCatalog,
  InMemorySummaryStore,
  InMemoryUsageCounters,
  validEngineOutput,
} from "./testing";

const LIMITS: UsageLimits = {
  guestDailySummaries: 3,
  guestDailySummariesPerIp: 5,
  memberDailySummaries: 10,
  dailyVideoMinutes: 1000,
};

const guest = (guestId = "guest-1", ipHash = "ip-1"): Requester => ({
  kind: "guest",
  guestId,
  ipHash,
});

/** Eleven distinct, valid video IDs. */
const VIDEOS = Array.from({ length: 11 }, (_, i) => `video${String(i).padStart(6, "0")}`);
const url = (videoId: string) => `https://youtu.be/${videoId}`;

function setup(limits: Partial<UsageLimits> = {}) {
  const engine = new FakeSummaryEngine();
  const catalog = new FakeVideoCatalog();
  const clock = new ControllableClock("2026-11-12T10:00:00.000Z");
  const core = createCore({
    engine,
    catalog,
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    clock,
    limits: { ...LIMITS, ...limits },
  });
  return { core, engine, catalog, clock };
}

describe("Guest daily limits", () => {
  it("refuses a Guest's 4th new Summary in a UTC day, with the reset time and the Member limit", async () => {
    const { core, engine } = setup();
    for (const videoId of VIDEOS.slice(0, 3)) {
      const result = await core.requestSummary({ videoUrl: url(videoId), requester: guest() });
      expect(result.status).toBe("ready");
    }

    expect(await core.requestSummary({ videoUrl: url(VIDEOS[3]), requester: guest() })).toEqual({
      status: "rejected",
      reason: "daily-limit-reached",
      resetsAt: "2026-11-13T00:00:00.000Z",
      memberDailyLimit: 10,
    });
    expect(engine.calls).toHaveLength(3);
  });

  it("doesn't count opening a Summary that already exists", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("someone-else", "ip-9") });

    for (let i = 0; i < 5; i++) {
      const again = await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() });
      expect(again.status).toBe("ready");
    }
    for (const videoId of VIDEOS.slice(1, 4)) {
      const result = await core.requestSummary({ videoUrl: url(videoId), requester: guest() });
      expect(result.status).toBe("ready");
    }
  });

  it("doesn't count a failed generation", async () => {
    const { core, engine } = setup();
    let failing = true;
    engine.respond = () => (failing ? { broken: true } : validEngineOutput());

    for (const videoId of VIDEOS.slice(0, 4)) {
      const result = await core.requestSummary({ videoUrl: url(videoId), requester: guest() });
      expect(result).toEqual({ status: "rejected", reason: "summary-failed" });
    }

    failing = false;
    for (const videoId of VIDEOS.slice(4, 7)) {
      const result = await core.requestSummary({ videoUrl: url(videoId), requester: guest() });
      expect(result.status).toBe("ready");
    }
  });

  it("doesn't count joining a Summary another request is already making", async () => {
    const { core, engine } = setup();
    engine.manual = true;
    const first = core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("a", "ip-a") });
    await vi.waitFor(() => expect(engine.calls).toHaveLength(1));

    const joined = core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("b", "ip-b") });
    engine.finish();
    expect((await joined).status).toBe("ready");
    await first;

    expect((await core.summariesLeftToday(guest("a", "ip-a"))).left).toBe(2);
    expect((await core.summariesLeftToday(guest("b", "ip-b"))).left).toBe(3);
  });

  it("counts only one of two simultaneous requests for the same new video", async () => {
    const { core, engine } = setup();
    await Promise.all([
      core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("a", "ip-a") }),
      core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("b", "ip-b") }),
    ]);

    const left = [
      (await core.summariesLeftToday(guest("a", "ip-a"))).left,
      (await core.summariesLeftToday(guest("b", "ip-b"))).left,
    ];
    expect(left.sort()).toEqual([2, 3]);
    expect(engine.calls).toHaveLength(1);
  });

  it("doesn't count a Summary another server stored while this request was checking", async () => {
    const engine = new FakeSummaryEngine();
    const store = new InMemorySummaryStore();
    const realFind = store.findSummary.bind(store);
    let lookups = 0;
    store.findSummary = async (videoId, language) => {
      lookups += 1;
      // Between this request's first look and its read, another server stores it.
      if (lookups === 2) {
        await store.saveSummary({
          videoId,
          language,
          spokenLanguage: "en",
          lengths: validEngineOutput().lengths,
          createdAt: "2026-11-12T09:59:00.000Z",
        });
      }
      return realFind(videoId, language);
    };
    const core = createCore({
      engine,
      catalog: new FakeVideoCatalog(),
      store,
      usage: new InMemoryUsageCounters(),
      clock: new ControllableClock(),
      limits: LIMITS,
    });

    expect((await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() })).status).toBe(
      "ready",
    );
    expect(engine.calls).toEqual([]);
    expect((await core.summariesLeftToday(guest())).left).toBe(3);
  });

  it("resets at midnight UTC", async () => {
    const { core, clock } = setup();
    for (const videoId of VIDEOS.slice(0, 3)) {
      await core.requestSummary({ videoUrl: url(videoId), requester: guest() });
    }
    clock.set("2026-11-12T23:59:59.000Z");
    expect((await core.requestSummary({ videoUrl: url(VIDEOS[3]), requester: guest() })).status).toBe(
      "rejected",
    );

    clock.set("2026-11-13T00:00:00.000Z");
    expect((await core.requestSummary({ videoUrl: url(VIDEOS[3]), requester: guest() })).status).toBe(
      "ready",
    );
  });

  it("caps all Guests behind one IP address, so clearing cookies doesn't get more", async () => {
    const { core } = setup({ guestDailySummaries: 3, guestDailySummariesPerIp: 5 });
    const results = [];
    for (const [i, videoId] of VIDEOS.slice(0, 6).entries()) {
      // A fresh cookie every time, from the same IP address.
      results.push(
        (await core.requestSummary({ videoUrl: url(videoId), requester: guest(`cookie-${i}`, "ip-1") }))
          .status,
      );
    }

    expect(results).toEqual(["ready", "ready", "ready", "ready", "ready", "rejected"]);
  });
});

describe("Usage counter failures", () => {
  it("gives back what it reserved when the counters fail partway, so the Guest isn't charged", async () => {
    const usage = new InMemoryUsageCounters();
    const realTryUse = usage.tryUse.bind(usage);
    let failNext = true;
    usage.tryUse = async (counter, day, amount, limit) => {
      if (counter.startsWith("ip:") && failNext) {
        failNext = false;
        throw new Error("database unreachable");
      }
      return realTryUse(counter, day, amount, limit);
    };
    const core = createCore({
      engine: new FakeSummaryEngine(),
      catalog: new FakeVideoCatalog(),
      store: new InMemorySummaryStore(),
      usage,
      clock: new ControllableClock(),
      limits: LIMITS,
    });

    expect(await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() })).toEqual({
      status: "rejected",
      reason: "summary-failed",
    });
    expect((await core.summariesLeftToday(guest())).left).toBe(3);
  });
});

describe("Member daily limits", () => {
  it("refuses a Member's 11th new Summary in a day, with no sign-up nudge", async () => {
    const { core } = setup();
    const member: Requester = { kind: "member", memberId: "m-1" };
    for (const videoId of VIDEOS.slice(0, 10)) {
      expect((await core.requestSummary({ videoUrl: url(videoId), requester: member })).status).toBe(
        "ready",
      );
    }

    expect(await core.requestSummary({ videoUrl: url(VIDEOS[10]), requester: member })).toEqual({
      status: "rejected",
      reason: "daily-limit-reached",
      resetsAt: "2026-11-13T00:00:00.000Z",
    });
  });
});

describe("Summaries left today", () => {
  it("counts down as a Guest makes new Summaries, and resets at midnight UTC", async () => {
    const { core, clock } = setup();
    expect(await core.summariesLeftToday(guest())).toEqual({
      left: 3,
      dailyLimit: 3,
      resetsAt: "2026-11-13T00:00:00.000Z",
    });

    await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() });
    await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() });
    expect((await core.summariesLeftToday(guest())).left).toBe(2);

    clock.set("2026-11-13T00:00:01.000Z");
    expect((await core.summariesLeftToday(guest())).left).toBe(3);
  });

  it("shows fewer when the Guest's IP address is nearly at its cap", async () => {
    const { core } = setup({ guestDailySummaries: 3, guestDailySummariesPerIp: 5 });
    for (const [i, videoId] of VIDEOS.slice(0, 4).entries()) {
      await core.requestSummary({ videoUrl: url(videoId), requester: guest(`cookie-${i}`, "ip-1") });
    }

    expect((await core.summariesLeftToday(guest("new-cookie", "ip-1"))).left).toBe(1);
  });
});

describe("App capacity", () => {
  it("refuses new Summaries once the day's video minutes run out, but still opens existing ones", async () => {
    // Three 5-minute videos fit in 12 minutes only twice.
    const { core, engine } = setup({ dailyVideoMinutes: 12 });
    const first = await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("a", "ip-a") });
    await core.requestSummary({ videoUrl: url(VIDEOS[1]), requester: guest("b", "ip-b") });

    expect(await core.requestSummary({ videoUrl: url(VIDEOS[2]), requester: guest("c", "ip-c") })).toEqual({
      status: "rejected",
      reason: "app-capacity-reached",
      resetsAt: "2026-11-13T00:00:00.000Z",
    });
    expect(engine.calls).toHaveLength(2);
    expect(await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("c", "ip-c") })).toEqual(
      first,
    );
  });

  it("keeps a timed-out read's minutes spent, since the engine may still be reading, but not the Guest's Summary", async () => {
    vi.useFakeTimers();
    try {
      const engine = new FakeSummaryEngine(undefined, { manual: true });
      const usage = new InMemoryUsageCounters();
      const core = createCore({
        engine,
        catalog: new FakeVideoCatalog(),
        store: new InMemorySummaryStore(),
        usage,
        clock: new ControllableClock(),
        limits: { ...LIMITS, dailyVideoMinutes: 5 },
        generationTimeoutMs: 1000,
      });

      const hung = core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest() });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await hung).toEqual({ status: "rejected", reason: "summary-failed" });

      expect(await usage.used("app:video-minutes", "2026-11-12")).toBe(5);
      expect((await core.summariesLeftToday(guest())).left).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't use up a Guest's daily Summaries when capacity refuses them", async () => {
    const { core, catalog } = setup({ dailyVideoMinutes: 10 });
    await core.requestSummary({ videoUrl: url(VIDEOS[0]), requester: guest("other", "ip-o") });
    // 5 of the 10 minutes are gone: 10-minute videos no longer fit, 1-minute ones do.
    for (const videoId of VIDEOS.slice(1, 4)) catalog.set(videoId, { durationSeconds: 600 });
    for (const videoId of VIDEOS.slice(4, 7)) catalog.set(videoId, { durationSeconds: 60 });

    for (const videoId of VIDEOS.slice(1, 4)) {
      expect((await core.requestSummary({ videoUrl: url(videoId), requester: guest() })).status).toBe(
        "rejected",
      );
    }
    for (const videoId of VIDEOS.slice(4, 7)) {
      expect((await core.requestSummary({ videoUrl: url(videoId), requester: guest() })).status).toBe(
        "ready",
      );
    }
  });
});
