/**
 * Test doubles for the core's adapters: a Summary engine that counts calls,
 * an in-memory Store and a fixed Clock.
 */
import type {
  Clock,
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

export class InMemorySummaryStore implements SummaryStore {
  private summaries = new Map<string, Summary>();

  async findSummary(videoId: string, language: Summary["language"]) {
    return this.summaries.get(`${videoId}:${language}`) ?? null;
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

  async tryUse(counter: string, day: string, amount: number, limit: number) {
    const used = await this.used(counter, day);
    if (used + amount > limit) return false;
    this.counts.set(`${counter}@${day}`, used + amount);
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
