import { describe, expect, it } from "vitest";
import { createCore } from "./core";
import type { Requester } from "./requester";
import { FakeSummaryEngine, FakeVideoCatalog, InMemorySummaryStore, fixedClock } from "./testing";

const ID = "dQw4w9WgXcQ";
const videoUrl = `https://youtu.be/${ID}`;
const guest: Requester = { kind: "guest" };
const member: Requester = { kind: "member" };

function setup() {
  const engine = new FakeSummaryEngine();
  const catalog = new FakeVideoCatalog();
  const store = new InMemorySummaryStore();
  const core = createCore({ engine, catalog, store, clock: fixedClock() });
  return { core, engine, catalog, store };
}

describe("video checks before reading a video", () => {
  it("turns a Guest away from a video over 15 minutes, mentioning that Members get 30, without reading it", async () => {
    const { core, engine, catalog } = setup();
    catalog.set(ID, { durationSeconds: 15 * 60 + 1 });

    expect(await core.requestSummary({ videoUrl, requester: guest })).toEqual({
      status: "rejected",
      reason: "video-too-long",
      limitMinutes: 15,
      memberLimitMinutes: 30,
    });
    expect(engine.calls).toEqual([]);
  });

  it("doesn't suggest becoming a Member when the video is too long for Members too", async () => {
    const { core, catalog } = setup();
    catalog.set(ID, { durationSeconds: 45 * 60 });

    expect(await core.requestSummary({ videoUrl, requester: guest })).toEqual({
      status: "rejected",
      reason: "video-too-long",
      limitMinutes: 15,
    });
  });

  it.each([
    ["a Guest", guest, 15 * 60],
    ["a Member", member, 30 * 60],
  ])("lets %s have a video exactly at their limit (%i seconds)", async (_, requester, durationSeconds) => {
    const { core, catalog } = setup();
    catalog.set(ID, { durationSeconds });

    expect((await core.requestSummary({ videoUrl, requester })).status).toBe("ready");
  });

  it("turns a Member away from a video over 30 minutes", async () => {
    const { core, catalog } = setup();
    catalog.set(ID, { durationSeconds: 30 * 60 + 1 });

    expect(await core.requestSummary({ videoUrl, requester: member })).toEqual({
      status: "rejected",
      reason: "video-too-long",
      limitMinutes: 30,
    });
  });

  it.each([
    ["private or deleted", { found: false } as const],
    ["private", { privacy: "private" } as const],
    ["unlisted", { privacy: "unlisted" } as const],
  ])("turns away a %s video as unavailable, without reading it", async (_, facts) => {
    const { core, engine, catalog } = setup();
    catalog.set(ID, facts);

    expect(await core.requestSummary({ videoUrl, requester: guest })).toEqual({
      status: "rejected",
      reason: "video-unavailable",
    });
    expect(engine.calls).toEqual([]);
  });

  it.each(["live", "upcoming"] as const)(
    "asks to come back later for a %s video, without reading it",
    async (broadcast) => {
      const { core, engine, catalog } = setup();
      // Live and upcoming videos report no duration yet.
      catalog.set(ID, { broadcast, durationSeconds: 0 });

      expect(await core.requestSummary({ videoUrl, requester: guest })).toEqual({
        status: "rejected",
        reason: "video-not-finished",
      });
      expect(engine.calls).toEqual([]);
    },
  );

  it("opens a stored Summary without checking the video again", async () => {
    const { core, catalog } = setup();
    await core.requestSummary({ videoUrl, requester: member });
    catalog.set(ID, { durationSeconds: 25 * 60 });
    catalog.lookups = [];

    const result = await core.requestSummary({ videoUrl, requester: guest });

    expect(result.status).toBe("ready");
    expect(catalog.lookups).toEqual([]);
  });

  it("turns a failed video lookup into summary-failed", async () => {
    const { core, engine, catalog } = setup();
    catalog.lookUpVideo = async () => {
      throw new Error("lookup service down");
    };

    expect(await core.requestSummary({ videoUrl, requester: guest })).toEqual({
      status: "rejected",
      reason: "summary-failed",
    });
    expect(engine.calls).toEqual([]);
  });
});
