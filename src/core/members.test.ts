import { describe, expect, it } from "vitest";
import { createCore } from "./core";
import {
  FakeSummaryEngine,
  FakeTranslator,
  FakeVideoCatalog,
  InMemoryMemberStore,
  InMemorySummaryStore,
  InMemoryUsageCounters,
  fixedClock,
} from "./testing";

function setup() {
  const members = new InMemoryMemberStore();
  const core = createCore({
    engine: new FakeSummaryEngine(),
    translator: new FakeTranslator(),
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    members,
    clock: fixedClock("2026-11-13T10:00:00.000Z"),
  });
  return { core, members };
}

describe("joining as a Member", () => {
  it("lets someone new join once they confirm they're 18 or older, with autoplay off", async () => {
    const { core } = setup();

    expect(await core.joinAsMember({ memberId: "m-1", confirmedAdult: true })).toEqual({
      status: "member",
      member: { id: "m-1", adultConfirmedAt: "2026-11-13T10:00:00.000Z", autoplay: false },
    });
  });

  it("turns away someone new who hasn't confirmed they're 18 or older", async () => {
    const { core, members } = setup();

    expect(await core.joinAsMember({ memberId: "m-1", confirmedAdult: false })).toEqual({
      status: "rejected",
      reason: "adult-confirmation-required",
    });
    expect(await members.findMember("m-1")).toBeNull();
  });

  it("signs a returning Member back in without asking again", async () => {
    const { core } = setup();
    await core.joinAsMember({ memberId: "m-1", confirmedAdult: true });

    const again = await core.joinAsMember({ memberId: "m-1", confirmedAdult: false });

    expect(again.status).toBe("member");
  });
});

describe("a Member's autoplay setting", () => {
  it("is saved to their account", async () => {
    const { core } = setup();
    await core.joinAsMember({ memberId: "m-1", confirmedAdult: true });

    await core.setMemberAutoplay("m-1", true);

    expect(await core.memberSettings("m-1")).toEqual({ autoplay: true });
  });

  it("is unknown for someone who never joined", async () => {
    const { core } = setup();
    expect(await core.memberSettings("nobody")).toBeNull();
  });
});
