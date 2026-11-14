/**
 * Test doubles for the core's adapters: a Summary engine that counts calls,
 * an in-memory Store and a fixed Clock.
 */
import type { Length, LengthContent } from "./summary";
import type {
  UploadStorage,
  UploadedVideo,
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

  /** Files it was given, and what to answer: a video's length decides "too-long". */
  fileCalls: UploadedVideo[] = [];
  fileDurationSeconds = 120;
  failFiles = false;

  async summarizeVideoFile(video: UploadedVideo, maxDurationSeconds: number) {
    this.fileCalls.push(video);
    if (this.failFiles) throw new Error("engine couldn't read the file");
    if (this.fileDurationSeconds > maxDurationSeconds) return { kind: "too-long" as const };
    return { kind: "read" as const, output: this.respond("upload") };
  }

  /** Texts it was given to summarize. */
  textCalls: string[] = [];
  failText = false;

  async summarizeText(text: string) {
    this.textCalls.push(text);
    if (this.failText) throw new Error("engine couldn't read the text");
    return this.respond("text");
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

  async deleteOwnedBy(ownerId: string) {
    for (const [key, summary] of this.summaries) {
      if (summary.ownerId === ownerId) this.summaries.delete(key);
    }
  }

  async deleteGuestOwnedBefore(cutoff: string) {
    const old = new Set(
      [...this.summaries.values()]
        .filter((s) => s.ownerId?.startsWith("guest-") && s.language === "english" && s.createdAt < cutoff)
        .map((s) => s.videoId),
    );
    for (const [key, summary] of this.summaries) {
      if (old.has(summary.videoId)) this.summaries.delete(key);
    }
    return old.size;
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

  async forgetBefore(day: string) {
    for (const key of [...this.counts.keys()]) {
      if (key.split("@")[1] < day) this.counts.delete(key);
    }
  }

  async forget(counter: string) {
    for (const key of [...this.counts.keys()]) {
      if (key.startsWith(`${counter}@`)) this.counts.delete(key);
    }
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

/** The first bytes of a real MP4 file: enough for the server to recognise it. */
export const MP4_HEAD = new Uint8Array([0, 0, 0, 0x20, ...new TextEncoder().encode("ftypisom"), 0, 0, 2, 0]);

export class InMemoryUploadStorage implements UploadStorage {
  files = new Map<string, UploadedVideo>();
  uploadedAt = new Map<string, string>();
  removed: string[] = [];

  async removeAllFor(memberId: string) {
    for (const path of [...this.files.keys()]) {
      if (path.startsWith(`${memberId}/`)) await this.remove(path);
    }
  }

  async removeOlderThan(cutoff: string) {
    const old = [...this.files.keys()].filter((path) => (this.uploadedAt.get(path) ?? "") < cutoff);
    for (const path of old) await this.remove(path);
    return old.length;
  }

  async createUploadUrl(path: string) {
    return `https://uploads.test/${path}?token=one-time`;
  }

  /** What the Member's browser does with the URL. */
  put(
    path: string,
    video: UploadedVideo = { bytes: MP4_HEAD, mimeType: "video/mp4" },
    at = "2026-11-12T10:00:00.000Z",
  ) {
    this.files.set(path, video);
    this.uploadedAt.set(path, at);
  }

  async read(path: string) {
    return this.files.get(path) ?? null;
  }

  async remove(path: string) {
    this.files.delete(path);
    this.removed.push(path);
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

  async removeAllFor(memberId: string) {
    for (const [key, entry] of this.entries) {
      if (entry.memberId === memberId) this.entries.delete(key);
    }
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

  async deleteMember(id: string) {
    this.members.delete(id);
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
