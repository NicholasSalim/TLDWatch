/**
 * The TLDWatch core: every business rule, free of any framework.
 * Route handlers turn requests into calls here and results into responses.
 */
import { DURATION_LIMIT_MINUTES } from "./limits";
import type { Clock, SummaryEngine, SummaryStore, UsageCounters, VideoCatalog } from "./ports";
import type { Requester } from "./requester";
import { engineOutputSchema, type Summary } from "./summary";
import { parseVideoUrl, type VideoUrlRejection } from "./video-url";

export type UsageLimits = {
  /** New Summaries a Guest (one anonymous cookie) may make per UTC day. */
  guestDailySummaries: number;
  /** New Summaries all Guests behind one IP address may make per UTC day. */
  guestDailySummariesPerIp: number;
  memberDailySummaries: number;
  /** Minutes of video the whole app may read per UTC day. */
  dailyVideoMinutes: number;
};

export const DEFAULT_LIMITS: UsageLimits = {
  guestDailySummaries: 3,
  guestDailySummariesPerIp: 10,
  memberDailySummaries: 10,
  // Below the Summary engine's free 8 hours of YouTube a day.
  dailyVideoMinutes: 360,
};

export type CoreDeps = {
  engine: SummaryEngine;
  catalog: VideoCatalog;
  store: SummaryStore;
  usage: UsageCounters;
  clock: Clock;
  limits?: UsageLimits;
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
    }
  | {
      status: "rejected";
      reason: "daily-limit-reached";
      resetsAt: string;
      /** Set for Guests: how many a Member gets instead. */
      memberDailyLimit?: number;
    }
  | { status: "rejected"; reason: "app-capacity-reached"; resetsAt: string };

export type SummaryResult = { status: "ready"; summary: Summary } | SummaryRejection;

export type SummariesLeft = { left: number; dailyLimit: number; resetsAt: string };

/** How a generation ended. */
type Generation =
  | { kind: "read"; summary: Summary }
  | { kind: "found"; summary: Summary }
  | { kind: "failed"; videoMayHaveBeenRead: boolean };

const APP_VIDEO_MINUTES = "app:video-minutes";

/** An amount reserved on one usage counter, given back if the request fails. */
type Reservation = { counter: string; amount: number; limit: number };

export function createCore({
  engine,
  catalog,
  store,
  usage,
  clock,
  limits = DEFAULT_LIMITS,
  generationTimeoutMs = 100_000,
  onFailure,
}: CoreDeps) {
  // Generations under way in this process, keyed by video ID. A request for a
  // video already under way joins it, so the video is read at most once.
  const underWay = new Map<string, Promise<Generation>>();

  /** Reads the video and stores its Summary, unless someone else already did. */
  async function generate(videoId: string): Promise<Generation> {
    let engineAnswered = false;
    try {
      // Another server may have stored it since this request looked.
      const existing = await store.findSummary(videoId, "english");
      if (existing) return { kind: "found", summary: existing };
      let raw: unknown;
      try {
        raw = await withDeadline(engine.summarizeYouTubeVideo(videoId), generationTimeoutMs);
        engineAnswered = true;
      } catch (error) {
        // A timed-out engine may still be reading; a refusing one read nothing.
        engineAnswered = error instanceof DeadlineExceeded;
        throw error;
      }
      const output = engineOutputSchema.parse(raw);
      const summary = await store.saveSummary({
        videoId,
        language: "english",
        spokenLanguage: output.spokenLanguage,
        lengths: output.lengths,
        createdAt: clock.now().toISOString(),
      });
      return { kind: "read", summary };
    } catch (error) {
      onFailure?.(error, { videoId });
      return { kind: "failed", videoMayHaveBeenRead: engineAnswered };
    }
  }

  /** Joins the generation under way for this video, or starts one. */
  async function joinOrStart(videoId: string): Promise<{ generation: Generation; started: boolean }> {
    const pending = underWay.get(videoId);
    if (pending) return { generation: await pending, started: false };
    const started = generate(videoId).finally(() => underWay.delete(videoId));
    underWay.set(videoId, started);
    return { generation: await started, started: true };
  }

  /** Looks the video up; returns why this requester can't have it, or its duration. */
  async function checkVideo(
    videoId: string,
    requester: Requester,
  ): Promise<{ rejection: SummaryRejection } | { durationSeconds: number }> {
    const facts = await catalog.lookUpVideo(videoId);
    // The Summary engine reads public videos only.
    if (!facts.found || facts.privacy !== "public") {
      return { rejection: { status: "rejected", reason: "video-unavailable" } };
    }
    if (facts.broadcast !== "none") {
      return { rejection: { status: "rejected", reason: "video-not-finished" } };
    }
    const limitMinutes = DURATION_LIMIT_MINUTES[requester.kind];
    if (facts.durationSeconds > limitMinutes * 60) {
      const memberLimitMinutes = DURATION_LIMIT_MINUTES.member;
      return {
        rejection:
          requester.kind === "guest" && facts.durationSeconds <= memberLimitMinutes * 60
            ? { status: "rejected", reason: "video-too-long", limitMinutes, memberLimitMinutes }
            : { status: "rejected", reason: "video-too-long", limitMinutes },
      };
    }
    return { durationSeconds: facts.durationSeconds };
  }

  /** The daily-Summary counters this requester draws on. */
  function summaryCounters(requester: Requester): Reservation[] {
    return requester.kind === "guest"
      ? [
          { counter: `guest:${requester.guestId}`, amount: 1, limit: limits.guestDailySummaries },
          { counter: `ip:${requester.ipHash}`, amount: 1, limit: limits.guestDailySummariesPerIp },
        ]
      : [{ counter: `member:${requester.memberId}`, amount: 1, limit: limits.memberDailySummaries }];
  }

  /** Reserves every amount, or none of them. Returns whether it did. */
  async function reserveAll(reservations: Reservation[], day: string, videoId: string) {
    const done: Reservation[] = [];
    try {
      for (const r of reservations) {
        if (!(await usage.tryUse(r.counter, day, r.amount, r.limit))) {
          await giveBackAll(done, day, videoId);
          return false;
        }
        done.push(r);
      }
      return true;
    } catch (error) {
      await giveBackAll(done, day, videoId);
      throw error;
    }
  }

  /** Gives back what a request reserved. Never throws: a failure here is only logged. */
  async function giveBackAll(reservations: Reservation[], day: string, videoId: string) {
    for (const r of reservations) {
      await usage.giveBack(r.counter, day, r.amount).catch((error) => onFailure?.(error, { videoId }));
    }
  }

  async function requestSummary({ videoUrl, requester }: SummaryRequest): Promise<SummaryResult> {
    const parsed = parseVideoUrl(videoUrl);
    if (!parsed.ok) return { status: "rejected", reason: parsed.reason };
    const { videoId } = parsed;
    const now = clock.now();
    const day = utcDay(now);

    // What this request has reserved; given back unless it read the video itself.
    const counters = summaryCounters(requester);
    let reserved: Reservation[] = [];
    try {
      // A stored Summary is always served, and never counts against a limit.
      const existing = await store.findSummary(videoId, "english");
      if (existing) return { status: "ready", summary: existing };

      // Joining a Summary someone else is already making doesn't count either.
      if (!underWay.has(videoId)) {
        const checked = await checkVideo(videoId, requester);
        if ("rejection" in checked) return checked.rejection;

        if (!(await reserveAll(counters, day, videoId))) {
          return {
            status: "rejected",
            reason: "daily-limit-reached",
            resetsAt: nextUtcMidnight(now),
            ...(requester.kind === "guest" && { memberDailyLimit: limits.memberDailySummaries }),
          };
        }
        reserved = counters;

        const minutes: Reservation = {
          counter: APP_VIDEO_MINUTES,
          amount: Math.max(1, Math.ceil(checked.durationSeconds / 60)),
          limit: limits.dailyVideoMinutes,
        };
        if (!(await reserveAll([minutes], day, videoId))) {
          await giveBackAll(reserved, day, videoId);
          return { status: "rejected", reason: "app-capacity-reached", resetsAt: nextUtcMidnight(now) };
        }
        reserved = [...counters, minutes];
      }
    } catch (error) {
      onFailure?.(error, { videoId });
      await giveBackAll(reserved, day, videoId);
      return { status: "rejected", reason: "summary-failed" };
    }

    const { generation, started } = await joinOrStart(videoId);

    if (started && generation.kind === "read") {
      // This request read the video: it keeps what it reserved.
    } else if (started && generation.kind === "failed" && generation.videoMayHaveBeenRead) {
      // The engine may have read the video, so its minutes stay spent; the Summary doesn't count.
      await giveBackAll(counters, day, videoId);
    } else {
      await giveBackAll(reserved, day, videoId);
    }

    return generation.kind === "failed"
      ? { status: "rejected", reason: "summary-failed" }
      : { status: "ready", summary: generation.summary };
  }

  /** How many more new Summaries this requester may make today. */
  async function summariesLeftToday(requester: Requester): Promise<SummariesLeft> {
    const now = clock.now();
    const day = utcDay(now);
    const counters = summaryCounters(requester);
    const lefts = await Promise.all(
      counters.map(async (c) => Math.max(0, c.limit - (await usage.used(c.counter, day)))),
    );
    return { left: Math.min(...lefts), dailyLimit: counters[0].limit, resetsAt: nextUtcMidnight(now) };
  }

  return { requestSummary, summariesLeftToday };
}

export type Core = ReturnType<typeof createCore>;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date: Date): string {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

class DeadlineExceeded extends Error {}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
