/**
 * The TLDWatch core: every business rule, free of any framework.
 * Route handlers turn requests into calls here and results into responses.
 */
import type { Clock, SummaryEngine, SummaryStore } from "./ports";
import { engineOutputSchema, type Summary } from "./summary";
import { parseVideoUrl, type VideoUrlRejection } from "./video-url";

export type CoreDeps = {
  engine: SummaryEngine;
  store: SummaryStore;
  clock: Clock;
  /**
   * How long reading a video may take before it counts as failed. Without
   * it, a hung engine call would leave every request for that video waiting.
   */
  generationTimeoutMs?: number;
  /** Told about each failed request, for server-side logging. Never shown to users. */
  onFailure?: (error: unknown, context: { videoId: string }) => void;
};

export type SummaryRequest = { videoUrl: string };

export type SummaryRejection = VideoUrlRejection | "summary-failed";

export type SummaryResult =
  | { status: "ready"; summary: Summary }
  | { status: "rejected"; reason: SummaryRejection };

export function createCore({
  engine,
  store,
  clock,
  generationTimeoutMs = 100_000,
  onFailure,
}: CoreDeps) {
  // Requests under way in this process, keyed by video ID. A request for a
  // video already under way joins it, so the video is read at most once.
  const underWay = new Map<string, Promise<Summary | null>>();

  /** Finds the stored Summary or reads the video; null when either fails. */
  async function findOrGenerate(videoId: string): Promise<Summary | null> {
    try {
      const existing = await store.findSummary(videoId, "english");
      if (existing) return existing;
      const raw = await withDeadline(engine.summarizeYouTubeVideo(videoId), generationTimeoutMs);
      const output = engineOutputSchema.parse(raw);
      return await store.saveSummary({
        videoId,
        language: "english",
        spokenLanguage: output.spokenLanguage,
        lengths: output.lengths,
        createdAt: clock.now().toISOString(),
      });
    } catch (error) {
      onFailure?.(error, { videoId });
      return null;
    }
  }

  function joinOrStart(videoId: string): Promise<Summary | null> {
    let pending = underWay.get(videoId);
    if (!pending) {
      pending = findOrGenerate(videoId).finally(() => underWay.delete(videoId));
      underWay.set(videoId, pending);
    }
    return pending;
  }

  async function requestSummary({ videoUrl }: SummaryRequest): Promise<SummaryResult> {
    const parsed = parseVideoUrl(videoUrl);
    if (!parsed.ok) return { status: "rejected", reason: parsed.reason };
    const summary = await joinOrStart(parsed.videoId);
    if (!summary) return { status: "rejected", reason: "summary-failed" };
    return { status: "ready", summary };
  }

  return { requestSummary };
}

export type Core = ReturnType<typeof createCore>;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
