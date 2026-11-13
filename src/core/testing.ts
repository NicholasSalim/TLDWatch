/**
 * Test doubles for the core's adapters: a Summary engine that counts calls,
 * an in-memory Store and a fixed Clock.
 */
import type { Length, LengthContent } from "./summary";
import type {
  Clock,
  NarrationAudioStore,
  NaturalVoice,
  HistoryEntry,
  HistoryStore,
  Member,
  MemberStore,
  Translator,
  SummaryEngine,
  SummaryStore,
  UsageCounters,
  VideoCatalog,
  VideoFacts,
} from "./ports";
import type { Summary } from "./summary";

const lengthContent = (detail: string) => ({
  overview: `A ${detail} overview of the video.`,
  keyPoints: [`First ${detail} point`, `Second ${detail} point`],
  timestamps: [
    { seconds: 0, label: "Intro" },
    { seconds: 95, label: "The main argument" },
  ],
  verdict: {
    worthWatching: true,
    deliversOnTitle: true,
    explanation: `Worth it, ${detail} edition.`,
  },
});

/** A well-formed engine output, as the real engine would return it. */
export function validEngineOutput(spokenLanguage = "en") {
  return {
    spokenLanguage,
    lengths: {
      short: lengthContent("short"),
      medium: lengthContent("medium"),
      detailed: lengthContent("detailed"),
    },
  };
}

export class FakeSummaryEngine implements SummaryEngine {
  calls: string[] = [];
  private pending: (() => void)[] = [];

  /** In manual mode, each call waits until `finish()` is called. */
  manual: boolean;

  constructor(
    public respond: (videoId: string) => unknown = () => validEngineOutput(),
    options: { manual?: boolean } = {},
  ) {
    this.manual = options.manual ?? false;
  }

  async summarizeYouTubeVideo(videoId: string): Promise<unknown> {
    this.calls.push(videoId);
    if (this.manual) {
      await new Promise<void>((resolve) => this.pending.push(resolve));
    }
    return this.respond(videoId);
  }

  /** In manual mode, lets every waiting call finish. */
  finish() {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}

/** Prefixes every text with the target language, e.g. "[ko] Intro". */
export function fakeTranslation(lengths: Record<Length, LengthContent>, target: string) {
  const t = (text: string) => `[${target}] ${text}`;
  return Object.fromEntries(
    Object.entries(lengths).map(([length, c]) => [
      length,
      {
        overview: t(c.overview),
        keyPoints: c.keyPoints.map(t),
        timestamps: c.timestamps.map((s) => ({ ...s, label: t(s.label) })),
        verdict: { ...c.verdict, explanation: t(c.verdict.explanation) },
      },
    ]),
  );
}

export class FakeTranslator implements Translator {
  calls: string[] = [];
  private pending: (() => void)[] = [];
  manual = false;

  constructor(
    public respond: (lengths: Record<Length, LengthContent>, target: string) => unknown = fakeTranslation,
  ) {}

  async translateSummary(lengths: Record<Length, LengthContent>, target: string) {
    this.calls.push(target);
    if (this.manual) await new Promise<void>((resolve) => this.pending.push(resolve));
    return this.respond(lengths, target);
  }

  finish() {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}

export class InMemorySummaryStore implements SummaryStore {
  private summaries = new Map<string, Summary>();

  async findSummary(videoId: string, language: Summary["language"]) {
    return this.summaries.get(`${videoId}:${language}`) ?? null;
  }

  async findSummaries(videoIds: string[], language: Summary["language"]) {
    return videoIds.flatMap((id) => this.summaries.get(`${id}:${language}`) ?? []);
  }

  async saveSummary(summary: Summary) {
    const key = `${summary.videoId}:${summary.language}`;
    const existing = this.summaries.get(key);
    if (existing) return existing;
    this.summaries.set(key, summary);
    return summary;
  }
}

const PUBLIC_FIVE_MINUTE_VIDEO: VideoFacts = {
  found: true,
  privacy: "public",
  broadcast: "none",
  durationSeconds: 300,
};

/** Every video is a public 5-minute video unless told otherwise. */
export class FakeVideoCatalog implements VideoCatalog {
  lookups: string[] = [];
  private videos = new Map<string, VideoFacts>();

  set(videoId: string, facts: Partial<Extract<VideoFacts, { found: true }>> | { found: false }) {
    this.videos.set(
      videoId,
      "found" in facts && facts.found === false
        ? { found: false }
        : ({ ...PUBLIC_FIVE_MINUTE_VIDEO, ...facts } as VideoFacts),
    );
  }

  async lookUpVideo(videoId: string): Promise<VideoFacts> {
    this.lookups.push(videoId);
    return this.videos.get(videoId) ?? PUBLIC_FIVE_MINUTE_VIDEO;
  }
}

export class InMemoryUsageCounters implements UsageCounters {
  private counts = new Map<string, number>();

  // Atomic, like the database: no await between checking and adding.
  async tryUse(counter: string, day: string, amount: number, limit: number) {
    const key = `${counter}@${day}`;
    const used = this.counts.get(key) ?? 0;
    if (used + amount > limit) return false;
    this.counts.set(key, used + amount);
    return true;
  }

  async giveBack(counter: string, day: string, amount: number) {
    const used = await this.used(counter, day);
    this.counts.set(`${counter}@${day}`, Math.max(0, used - amount));
  }

  async used(counter: string, day: string) {
    return this.counts.get(`${counter}@${day}`) ?? 0;
  }
}

export class FakeNaturalVoice implements NaturalVoice {
  /** English has two voices, Korean one; any other language falls back to "voice-a". */
  voicesFor(languageCode: string) {
    const base = languageCode.split("-")[0];
    return base === "en" ? ["voice-a", "voice-b"] : base === "ko" ? ["voice-ko"] : ["voice-a"];
  }
  readonly model = "test-model";
  calls: { text: string; languageCode: string; voiceId: string }[] = [];
  failing = false;
  manual = false;
  private pending: (() => void)[] = [];

  async synthesize(text: string, languageCode: string, voiceId: string) {
    this.calls.push({ text, languageCode, voiceId });
    if (this.manual) await new Promise<void>((resolve) => this.pending.push(resolve));
    if (this.failing) throw new Error("voice service unavailable");
    return new TextEncoder().encode(`mp3:${languageCode}:${text.slice(0, 20)}`);
  }

  finish() {
    this.pending.splice(0).forEach((resolve) => resolve());
  }
}

export class InMemoryNarrationAudioStore implements NarrationAudioStore {
  audio = new Map<string, Uint8Array>();

  async findAudio(key: string) {
    return this.audio.has(key) ? `https://audio.test/${key}` : null;
  }

  async saveAudio(key: string, mp3: Uint8Array) {
    if (!this.audio.has(key)) this.audio.set(key, mp3);
    return `https://audio.test/${key}`;
  }
}

export class InMemoryHistoryStore implements HistoryStore {
  private entries = new Map<string, HistoryEntry>();

  async recordOpened(entry: HistoryEntry) {
    this.entries.set(`${entry.memberId}:${entry.videoId}`, entry);
  }

  async listHistory(memberId: string, limit: number, before?: string) {
    return [...this.entries.values()]
      .filter((e) => e.memberId === memberId && (!before || e.openedAt < before))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, limit);
  }

  async removeEntry(memberId: string, videoId: string) {
    this.entries.delete(`${memberId}:${videoId}`);
  }
}

export class InMemoryMemberStore implements MemberStore {
  private members = new Map<string, Member>();

  async findMember(id: string) {
    return this.members.get(id) ?? null;
  }

  async createMember(member: Member) {
    const existing = this.members.get(member.id);
    if (existing) return existing;
    this.members.set(member.id, member);
    return member;
  }

  async setAutoplay(id: string, on: boolean) {
    const member = this.members.get(id);
    if (member) this.members.set(id, { ...member, autoplay: on });
  }
}

export const fixedClock = (iso = "2026-11-12T10:00:00.000Z"): Clock => ({
  now: () => new Date(iso),
});

/** A clock tests can move forward. */
export class ControllableClock implements Clock {
  private current: Date;
  constructor(iso = "2026-11-12T10:00:00.000Z") {
    this.current = new Date(iso);
  }
  now() {
    return new Date(this.current);
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
}
