import { describe, expect, it, vi } from "vitest";
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
const K = "videoKKKKKK";
const member: Requester = { kind: "member", memberId: "m-1" };
const guest: Requester = { kind: "guest", guestId: "g-1", ipHash: "ip-1" };

function setup(monthlyCharacters = 10_000) {
  const clock = new ControllableClock("2026-11-13T10:00:00.000Z");
  const voice = new FakeNaturalVoice();
  const audio = new InMemoryNarrationAudioStore();
  const core = createCore({
    engine: new FakeSummaryEngine((id) => validEngineOutput(id === K ? "ko" : "en")),
    translator: new FakeTranslator(),
    catalog: new FakeVideoCatalog(),
    store: new InMemorySummaryStore(),
    usage: new InMemoryUsageCounters(),
    members: new InMemoryMemberStore(),
    history: new InMemoryHistoryStore(),
    voice,
    narrationAudio: audio,
    clock,
    naturalVoiceMonthlyCharacters: monthlyCharacters,
  });
  const summarize = (videoId: string, language: "english" | "original" = "english") =>
    core.requestSummary({ videoUrl: `https://youtu.be/${videoId}`, requester: member, language });
  return { core, voice, audio, clock, summarize };
}

describe("requestNarration", () => {
  it("makes Natural voice audio of what's on screen for a Member, and stores it", async () => {
    const { core, voice, audio, summarize } = setup();
    await summarize(A);

    const result = await core.requestNarration({ videoId: A, language: "english", length: "medium", requester: member });

    expect(result).toEqual({ voice: "natural", audioUrl: "https://audio.test/videoAAAAAA/english/medium/voice-a-test-model.mp3" });
    expect(voice.calls).toEqual([
      {
        languageCode: "en",
        voiceId: "voice-a",
        text: "A medium overview of the video. First medium point Second medium point Worth it, medium edition.",
      },
    ]);
    expect(audio.audio.size).toBe(1);
  });

  it("speaks an original-language Summary in that language", async () => {
    const { core, voice, summarize } = setup();
    await summarize(K, "original");

    await core.requestNarration({ videoId: K, language: "original", length: "short", requester: member });

    expect(voice.calls[0].languageCode).toBe("ko");
    expect(voice.calls[0].text.startsWith("[ko] ")).toBe(true);
  });

  it("reuses stored audio for everyone, without using the allowance again", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);
    const ask = (memberId: string) =>
      core.requestNarration({ videoId: A, language: "english", length: "medium", requester: { kind: "member", memberId } });

    await ask("m-1");
    const before = await core.naturalVoiceAllowance();
    const again = await ask("m-2");

    expect(again.voice).toBe("natural");
    expect(voice.calls).toHaveLength(1);
    expect(await core.naturalVoiceAllowance()).toEqual(before);
  });

  it("makes each Length and language separately", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);

    for (const length of ["short", "medium", "detailed"] as const) {
      await core.requestNarration({ videoId: A, language: "english", length, requester: member });
    }

    expect(voice.calls).toHaveLength(3);
  });

  it("shares one generation between simultaneous requests", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);
    voice.manual = true;

    const requests = [1, 2, 3].map(() =>
      core.requestNarration({ videoId: A, language: "english", length: "short", requester: member }),
    );
    await vi.waitFor(() => expect(voice.calls).toHaveLength(1));
    voice.finish();

    expect((await Promise.all(requests)).every((r) => r.voice === "natural")).toBe(true);
    expect(voice.calls).toHaveLength(1);
  });

  it("gives Guests the Standard voice", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);

    expect(await core.requestNarration({ videoId: A, language: "english", length: "short", requester: guest })).toEqual({
      voice: "standard",
      reason: "guest",
    });
    expect(voice.calls).toEqual([]);
  });

  it("falls back to the Standard voice once the month's characters run out, and resets next month", async () => {
    // Each Medium Summary narration is 94 characters; 150 fits one.
    const { core, voice, clock, summarize } = setup(150);
    await summarize(A);
    await summarize(K);

    await core.requestNarration({ videoId: A, language: "english", length: "medium", requester: member });
    expect(await core.requestNarration({ videoId: K, language: "english", length: "medium", requester: member })).toEqual({
      voice: "standard",
      reason: "allowance-used-up",
    });
    expect(await core.naturalVoiceAllowance()).toEqual({
      charactersLeft: 150 - voice.calls[0].text.length,
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    expect(voice.calls).toHaveLength(1);

    clock.set("2026-12-01T00:00:01.000Z");
    expect((await core.requestNarration({ videoId: K, language: "english", length: "medium", requester: member })).voice).toBe(
      "natural",
    );
  });

  it("still plays stored audio after the allowance is used up", async () => {
    const { core, summarize } = setup(150);
    await summarize(A);
    await summarize(K);
    await core.requestNarration({ videoId: A, language: "english", length: "medium", requester: member });
    await core.requestNarration({ videoId: K, language: "english", length: "medium", requester: member });

    expect((await core.requestNarration({ videoId: A, language: "english", length: "medium", requester: member })).voice).toBe(
      "natural",
    );
  });

  it("falls back, and gives the characters back, when the Natural voice fails", async () => {
    const { core, voice, summarize } = setup(150);
    await summarize(A);
    voice.failing = true;

    expect(await core.requestNarration({ videoId: A, language: "english", length: "medium", requester: member })).toEqual({
      voice: "standard",
      reason: "natural-voice-unavailable",
    });
    expect(await core.naturalVoiceAllowance()).toEqual({ charactersLeft: 150, resetsAt: "2026-12-01T00:00:00.000Z" });
  });

  it("makes the audio once even when two servers are asked at the same moment", async () => {
    // Two server instances: separate processes, sharing the database and storage.
    const store = new InMemorySummaryStore();
    const usage = new InMemoryUsageCounters();
    const audio = new InMemoryNarrationAudioStore();
    const voice = new FakeNaturalVoice();
    const instance = () =>
      createCore({
        engine: new FakeSummaryEngine(),
        translator: new FakeTranslator(),
        catalog: new FakeVideoCatalog(),
        store,
        usage,
        members: new InMemoryMemberStore(),
        history: new InMemoryHistoryStore(),
        voice,
        narrationAudio: audio,
        clock: new ControllableClock("2026-11-13T10:00:00.000Z"),
      });
    const [one, two] = [instance(), instance()];
    await one.requestSummary({ videoUrl: `https://youtu.be/${A}`, requester: member });
    voice.manual = true;
    const ask = (core: ReturnType<typeof instance>) =>
      core.requestNarration({ videoId: A, language: "english", length: "short", requester: member });

    const both = [ask(one), ask(two)];
    await vi.waitFor(() => expect(voice.calls).toHaveLength(1));
    voice.finish();
    const results = await Promise.all(both);

    expect(results.map((r) => r.voice)).toEqual(["natural", "natural"]);
    expect(voice.calls).toHaveLength(1);
    const once = (await one.naturalVoiceAllowance()).charactersLeft;
    expect(once).toBe(8_000 - voice.calls[0].text.length);
  });

  it("keeps a timed-out generation's characters spent, since the voice service may have used them", async () => {
    vi.useFakeTimers();
    try {
      const { core, voice, summarize } = setup(1_000);
      await summarize(A);
      voice.manual = true;

      const pending = core.requestNarration({ videoId: A, language: "english", length: "short", requester: member });
      await vi.advanceTimersByTimeAsync(30_000);

      expect(await pending).toEqual({ voice: "standard", reason: "natural-voice-unavailable" });
      expect((await core.naturalVoiceAllowance()).charactersLeft).toBe(1_000 - voice.calls[0].text.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it("speaks in the Natural voice a Member chose, storing each voice's audio separately", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);
    const ask = (naturalVoiceId?: string) =>
      core.requestNarration({ videoId: A, language: "english", length: "short", requester: member, naturalVoiceId });

    const b = await ask("voice-b");
    const a = await ask("voice-a");
    await ask("voice-b");

    expect(voice.calls.map((c) => c.voiceId)).toEqual(["voice-b", "voice-a"]);
    expect(b).toEqual({ voice: "natural", audioUrl: "https://audio.test/videoAAAAAA/english/short/voice-b-test-model.mp3" });
    expect(a).toEqual({ voice: "natural", audioUrl: "https://audio.test/videoAAAAAA/english/short/voice-a-test-model.mp3" });
  });

  it("reads an original-language Summary in a voice native to that language", async () => {
    const { core, voice, summarize } = setup();
    await summarize(K, "original");

    await core.requestNarration({ videoId: K, language: "original", length: "short", requester: member });

    expect(voice.calls[0]).toMatchObject({ languageCode: "ko", voiceId: "voice-ko" });
  });

  it("won't read Korean in a voice listed only for English", async () => {
    const { core, voice, summarize } = setup();
    await summarize(K, "original");

    await core.requestNarration({
      videoId: K,
      language: "original",
      length: "short",
      requester: member,
      naturalVoiceId: "voice-b",
    });

    expect(voice.calls[0].voiceId).toBe("voice-ko");
  });

  it("uses the default Natural voice for one that isn't on the list", async () => {
    const { core, voice, summarize } = setup();
    await summarize(A);

    await core.requestNarration({
      videoId: A,
      language: "english",
      length: "short",
      requester: member,
      naturalVoiceId: "someone-elses-cloned-voice",
    });

    expect(voice.calls[0].voiceId).toBe("voice-a");
  });

  it("has nothing to narrate for a Summary that doesn't exist", async () => {
    const { core, voice } = setup();

    expect(await core.requestNarration({ videoId: A, language: "english", length: "short", requester: member })).toEqual({
      voice: "standard",
      reason: "no-summary",
    });
    expect(voice.calls).toEqual([]);
  });
});
