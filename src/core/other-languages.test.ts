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
} from "./testing";

const EN_VIDEO = "videoENGLSH";
const KO_VIDEO = "videoKOREAN";
const url = (id: string) => `https://youtu.be/${id}`;
const member: Requester = { kind: "member", memberId: "m-1" };
const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };

function setup() {
  const engine = new FakeSummaryEngine((id) => validOutputFor(id));
  const translator = new FakeTranslator();
  const voice = new FakeNaturalVoice();
  const core = createCore({
    engine,
    translator,
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(),
    voice,
    narrationAudio: new InMemoryNarrationAudioStore(), uploads: new InMemoryUploadStorage(),
    clock: fixedClock(),
    summaryLanguages: ["id", "es", "ko"],
  });
  const ask = (videoId: string, language: string, requester: Requester = member) =>
    core.requestSummary({ videoUrl: url(videoId), requester, language });
  return { core, engine, translator, voice, ask };
}

function validOutputFor(videoId: string) {
  return {
    spokenLanguage: videoId === KO_VIDEO ? "ko" : "en",
    lengths: Object.fromEntries(
      (["short", "medium", "detailed"] as const).map((length) => [
        length,
        {
          overview: `A ${length} overview.`,
          keyPoints: [`A ${length} point.`],
          timestamps: [{ seconds: 30, label: "A moment" }],
          verdict: { worthWatching: true, deliversOnTitle: true, explanation: "Worth it." },
        },
      ]),
    ),
  };
}

describe("a Summary in another language", () => {
  it("translates the English Summary for a Member, without reading the video again", async () => {
    const { engine, translator, ask } = setup();

    const result = await ask(EN_VIDEO, "id");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.summary.language).toBe("id");
    expect(result.summary.lengths.short.overview).toBe("[id] A short overview.");
    expect(result.summary.lengths.short.timestamps[0].seconds).toBe(30);
    expect(engine.calls).toEqual([EN_VIDEO]);
    expect(translator.calls).toEqual(["id"]);
  });

  it("stores the translation and reuses it", async () => {
    const { translator, ask } = setup();
    const first = await ask(EN_VIDEO, "es");
    const second = await ask(EN_VIDEO, "es");

    expect(second).toEqual(first);
    expect(translator.calls).toEqual(["es"]);
  });

  it("reuses the original-language Summary when the language chosen is the one spoken", async () => {
    const { translator, ask } = setup();

    const korean = await ask(KO_VIDEO, "ko");
    const original = await ask(KO_VIDEO, "original");

    expect(korean.status === "ready" && korean.summary.language).toBe("original");
    expect(original).toEqual(korean);
    expect(translator.calls).toEqual(["ko"]);
  });

  it("is for Members: a Guest is turned away before anything is made", async () => {
    const { engine, translator, ask } = setup();

    expect(await ask(EN_VIDEO, "id", guest)).toEqual({
      status: "rejected",
      reason: "language-members-only",
    });
    expect(engine.calls).toEqual([]);
    expect(translator.calls).toEqual([]);
  });

  it("only offers the configured languages", async () => {
    const { translator, ask } = setup();

    expect(await ask(EN_VIDEO, "fr")).toEqual({ status: "rejected", reason: "language-not-offered" });
    expect(translator.calls).toEqual([]);
  });

  it("falls back to English, with a note, when translating fails", async () => {
    const { translator, ask } = setup();
    translator.respond = () => ({ broken: true });

    const result = await ask(EN_VIDEO, "id");

    expect(result.status === "ready" && result.summary.language).toBe("english");
    expect(result.status === "ready" && result.translationFailed).toBe(true);
  });

  it("is read aloud in that language", async () => {
    const { core, voice, ask } = setup();
    await ask(EN_VIDEO, "id");

    await core.requestNarration({ videoId: EN_VIDEO, language: "id", length: "short", requester: member });

    expect(voice.calls[0].languageCode).toBe("id");
    expect(voice.calls[0].text.startsWith("[id] ")).toBe(true);
  });

  it("opens a share link in the video's own language code as its original-language Summary", async () => {
    const { core, ask } = setup();
    const original = await ask(KO_VIDEO, "original");

    expect(await core.readSharedSummary(KO_VIDEO, "ko")).toEqual(
      original.status === "ready" && original.summary,
    );
  });

  it("treats a language it can't make sense of as English", async () => {
    const { core, translator, ask } = setup();
    await ask(EN_VIDEO, "english");

    const odd = await core.requestSummary({ videoUrl: url(EN_VIDEO), requester: member, language: "../../x" });

    expect(odd.status === "ready" && odd.summary.language).toBe("english");
    expect(await core.readSharedSummary(EN_VIDEO, "<script>")).toMatchObject({ language: "english" });
    expect(translator.calls).toEqual([]);
  });

  it("opens from a share link and is remembered in History", async () => {
    const { core, ask } = setup();
    const made = await ask(EN_VIDEO, "id");

    expect(await core.readSharedSummary(EN_VIDEO, "id")).toEqual(made.status === "ready" && made.summary);
    const [entry] = await core.listHistory("m-1");
    expect(entry).toMatchObject({ videoId: EN_VIDEO, language: "id", preview: "[id] A short overview." });
  });
});
