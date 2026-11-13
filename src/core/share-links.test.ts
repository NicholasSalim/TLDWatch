import { describe, expect, it } from "vitest";
import { createCore } from "./core";
import type { Requester } from "./requester";
import {
  FakeSummaryEngine,
  FakeTranslator,
  FakeVideoCatalog,
  InMemoryMemberStore,
  InMemorySummaryStore,
  InMemoryUsageCounters,
  fixedClock,
} from "./testing";

const ID = "dQw4w9WgXcQ";
const guest: Requester = { kind: "guest", guestId: "guest-1", ipHash: "ip-1" };

function setup() {
  const engine = new FakeSummaryEngine();
  const catalog = new FakeVideoCatalog();
  const core = createCore({
    translator: new FakeTranslator(),
    engine,
    catalog,
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(), members: new InMemoryMemberStore(),
    clock: fixedClock(),
  });
  return { core, engine, catalog };
}

describe("share links", () => {
  it("opens a stored Summary by its share id", async () => {
    const { core } = setup();
    const made = await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest });
    if (made.status !== "ready") throw new Error("setup failed");

    // A YouTube Summary's share id is its video ID.
    expect(await core.readSharedSummary(ID)).toEqual(made.summary);
  });

  it("never counts against the Guest's daily Summaries", async () => {
    const { core } = setup();
    await core.requestSummary({ videoUrl: `https://youtu.be/${ID}`, requester: guest });
    const before = await core.summariesLeftToday(guest);

    for (let i = 0; i < 5; i++) await core.readSharedSummary(ID);

    expect(await core.summariesLeftToday(guest)).toEqual(before);
  });

  it("never makes a Summary or looks the video up when none exists", async () => {
    const { core, engine, catalog } = setup();

    expect(await core.readSharedSummary(ID)).toBeNull();
    expect(engine.calls).toEqual([]);
    expect(catalog.lookups).toEqual([]);
  });

  it.each(["", "not-a-video", "../../etc/passwd", `${ID}x`])(
    "treats %j as no Summary",
    async (shareId) => {
      const { core } = setup();
      expect(await core.readSharedSummary(shareId)).toBeNull();
    },
  );
});
