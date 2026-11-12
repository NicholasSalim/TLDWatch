/**
 * The TLDWatch core: every business rule, free of any framework.
 * Route handlers turn requests into calls here and results into responses.
 */
import { DURATION_LIMIT_MINUTES } from "./limits";
import type { Clock, SummaryEngine, SummaryStore, VideoCatalog } from "./ports";
import { engineOutputSchema, type Summary } from "./summary";
import type { Requester } from "./requester";
import { parseVideoUrl, type VideoUrlRejection } from "./video-url";

export type CoreDeps = {
  engine: SummaryEngine;
  catalog: VideoCatalog;
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

export type SummaryRequest = { videoUrl: string; requester: Requester };

export type SummaryRejection =
  | {
      status: "rejected";
      reason: VideoUrlRejection | "video-unavailable" | "video-not-finished" | "summary-failed";
    }
  | {
      status: "rejected";
      reason: "video-too-long";
      limitMinutes: number;
      /** Set when signing up as a Member would allow this video. */
      memberLimitMinutes?: number;
    };

export type SummaryResult = { status: "ready"; summary: Summary } | SummaryRejection;

export function createCore({
  engine,
  catalog,
  store,
  clock,
  generationTimeoutMs = 100_000,
  onFailure,
}: CoreDeps) {
  // Generations under way in this process, keyed by video ID. A request for a
  // video already under way joins it, so the video is read at most once.
  const underWay = new Map<string, Promise<Summary | null>>();

  /** Reads the video and stores its Summary; null when that fails. */
  async function generate(videoId: string): Promise<Summary | null> {
    try {
      // Another request may have stored it since this one looked.
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
      pending = generate(videoId).finally(() => underWay.delete(videoId));
      underWay.set(videoId, pending);
    }
    return pending;
  }

  /** Why this requester can't have this video summarized, if they can't. */
  async function checkVideo(
    videoId: string,
    requester: Requester,
  ): Promise<SummaryRejection | null> {
    const facts = await catalog.lookUpVideo(videoId);
    // The Summary engine reads public videos only.
    if (!facts.found || facts.privacy !== "public") {
      return { status: "rejected", reason: "video-unavailable" };
    }
    if (facts.broadcast !== "none") {
      return { status: "rejected", reason: "video-not-finished" };
    }
    const limitMinutes = DURATION_LIMIT_MINUTES[requester.kind];
    if (facts.durationSeconds > limitMinutes * 60) {
      const memberLimitMinutes = DURATION_LIMIT_MINUTES.member;
      return requester.kind === "guest" && facts.durationSeconds <= memberLimitMinutes * 60
        ? { status: "rejected", reason: "video-too-long", limitMinutes, memberLimitMinutes }
        : { status: "rejected", reason: "video-too-long", limitMinutes };
    }
    return null;
  }

  async function requestSummary({ videoUrl, requester }: SummaryRequest): Promise<SummaryResult> {
    const parsed = parseVideoUrl(videoUrl);
    if (!parsed.ok) return { status: "rejected", reason: parsed.reason };
    const { videoId } = parsed;

    try {
      // A stored Summary is always served: the checks below protect quota.
      const existing = await store.findSummary(videoId, "english");
      if (existing) return { status: "ready", summary: existing };
      const rejection = await checkVideo(videoId, requester);
      if (rejection) return rejection;
    } catch (error) {
      onFailure?.(error, { videoId });
      return { status: "rejected", reason: "summary-failed" };
    }

    const summary = await joinOrStart(videoId);
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
