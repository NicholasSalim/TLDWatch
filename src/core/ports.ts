/**
 * The adapters the core depends on. Production wires in the real services;
 * tests swap in the fakes from `./testing`.
 */
import type { Summary, SummaryLanguage } from "./summary";

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

export interface Clock {
  now(): Date;
}
