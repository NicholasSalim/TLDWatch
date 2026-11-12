/**
 * Test doubles for the core's adapters: a Summary engine that counts calls,
 * an in-memory Store and a fixed Clock.
 */
import type { Clock, SummaryEngine, SummaryStore } from "./ports";
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
    private respond: (videoId: string) => unknown = () => validEngineOutput(),
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

export const fixedClock = (iso = "2026-11-12T10:00:00.000Z"): Clock => ({
  now: () => new Date(iso),
});
