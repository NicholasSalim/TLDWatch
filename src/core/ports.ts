/**
 * The adapters the core depends on. Production wires in the real services;
 * tests swap in the fakes from `./testing`.
 */
import type { Length, LengthContent, Summary, SummaryLanguage } from "./summary";

export interface SummaryEngine {
  /**
   * Reads a public YouTube video and returns its Summary content for all
   * three Lengths, in English, plus the detected spoken language. The output
   * is untrusted: the core validates it before use.
   */
  summarizeYouTubeVideo(videoId: string): Promise<unknown>;
}

export interface SummaryStore {
  findSummary(videoId: string, language: SummaryLanguage): Promise<Summary | null>;
  /**
   * Stores a Summary. If one already exists for the same video and language,
   * keeps the existing one and returns it.
   */
  saveSummary(summary: Summary): Promise<Summary>;
}

export interface Translator {
  /**
   * Translates a Summary's three Lengths into another language (a BCP-47
   * code such as "ko"), keeping their shape. Text only: the video is never
   * read. The output is untrusted: the core validates it before use.
   */
  translateSummary(
    lengths: Record<Length, LengthContent>,
    targetLanguage: string,
  ): Promise<unknown>;
}

/** What can be known about a YouTube video without reading it. */
export type VideoFacts =
  | { found: false }
  | {
      found: true;
      privacy: "public" | "unlisted" | "private";
      broadcast: "none" | "live" | "upcoming";
      durationSeconds: number;
    };

export interface VideoCatalog {
  /** Looks a video up cheaply, without spending Summary engine quota. */
  lookUpVideo(videoId: string): Promise<VideoFacts>;
}

/**
 * Daily usage counters, shared by every server instance. A counter is a key
 * such as "guest:<id>" or "app:video-minutes"; a day is a UTC date
 * ("2026-11-12").
 */
export interface UsageCounters {
  /**
   * Adds `amount` to the counter if that keeps it within `limit`, atomically.
   * Returns false, and changes nothing, if it wouldn't.
   */
  tryUse(counter: string, day: string, amount: number, limit: number): Promise<boolean>;
  /** Gives back an amount used by a request that then failed. */
  giveBack(counter: string, day: string, amount: number): Promise<void>;
  used(counter: string, day: string): Promise<number>;
}

export interface Clock {
  now(): Date;
}
