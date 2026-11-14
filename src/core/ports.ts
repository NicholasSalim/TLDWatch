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
  /**
   * Reads an uploaded video file the same way. It refuses, without summarizing,
   * a video longer than `maxDurationSeconds`. Cleans up after itself either way.
   */
  summarizeVideoFile(
    video: UploadedVideo,
    maxDurationSeconds: number,
  ): Promise<{ kind: "too-long" } | { kind: "read"; output: unknown }>;
  /**
   * Summarizes a pasted text (an article, notes, a transcript) in the same
   * shape, in English, with "spokenLanguage" the language it's written in.
   * The text is untrusted content, never instructions; the output is checked.
   */
  summarizeText(text: string): Promise<unknown>;
}

/** An uploaded video file, as the engine reads it. */
export type UploadedVideo = { bytes: Uint8Array; mimeType: string };

/**
 * Private storage for Uploads while they're summarized. A path is
 * "<memberId>/<uploadId>", so a Member can only ever reach their own.
 */
export interface UploadStorage {
  /** A short-lived URL the Member's browser uploads the file to, directly. */
  createUploadUrl(path: string): Promise<string>;
  /** The uploaded file, or null if there's none at that path. */
  read(path: string): Promise<UploadedVideo | null>;
  remove(path: string): Promise<void>;
  /** Deletes every file waiting in a Member's folder. */
  removeAllFor(memberId: string): Promise<void>;
  /** Deletes every file uploaded before `cutoff` (an ISO time); returns how many. */
  removeOlderThan(cutoff: string): Promise<number>;
}

export interface SummaryStore {
  findSummary(videoId: string, language: SummaryLanguage): Promise<Summary | null>;
  /** The stored Summaries among these videos, in this language, in any order. */
  findSummaries(videoIds: string[], language: SummaryLanguage): Promise<Summary[]>;
  /**
   * Stores a Summary. If one already exists for the same video and language,
   * keeps the existing one and returns it.
   */
  saveSummary(summary: Summary): Promise<Summary>;
  /** Deletes every Summary a Member owns (their Uploads, in every language). */
  deleteOwnedBy(ownerId: string): Promise<void>;
  /**
   * Deletes every Upload owned by a Guest (an owner starting "guest-") whose
   * first Summary was made before `cutoff` (an ISO time), in every language.
   * Returns how many Uploads went.
   */
  deleteGuestOwnedBefore(cutoff: string): Promise<number>;
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
  /** Deletes a counter on every day it was used (a deleted Member's, say). */
  forget(counter: string): Promise<void>;
  /** Deletes every count from before a day ("2026-10-01"). */
  forgetBefore(day: string): Promise<void>;
}

/** A Member's profile: who they are to TLDWatch, beyond their Google sign-in. */
export type Member = {
  id: string;
  /** When they confirmed they're 18 or older, at sign-up. */
  adultConfirmedAt: string;
  autoplay: boolean;
};

export interface MemberStore {
  findMember(id: string): Promise<Member | null>;
  /** Creates the profile, or returns the existing one if it's already there. */
  createMember(member: Member): Promise<Member>;
  setAutoplay(id: string, on: boolean): Promise<void>;
  deleteMember(id: string): Promise<void>;
}

/** One video a Member has opened: the language last opened, and when. */
export type HistoryEntry = {
  memberId: string;
  videoId: string;
  language: SummaryLanguage;
  openedAt: string;
};

export interface HistoryStore {
  /** Adds the entry, or moves an existing one for the same video to this time and language. */
  recordOpened(entry: HistoryEntry): Promise<void>;
  /** Newest first; with `before`, only entries opened earlier than that time. */
  listHistory(memberId: string, limit: number, before?: string): Promise<HistoryEntry[]>;
  removeEntry(memberId: string, videoId: string): Promise<void>;
  removeAllFor(memberId: string): Promise<void>;
}

export interface NaturalVoice {
  /**
   * The voices Members may choose from for a language (BCP-47, e.g. "ko"),
   * native speakers where there are some; the first is the default.
   */
  voicesFor(languageCode: string): string[];
  /** The model speaking them, so changing it never replays old audio. */
  readonly model: string;
  /** Speaks text in a language (BCP-47, e.g. "ko") in a voice, and returns the MP3 audio. */
  synthesize(text: string, languageCode: string, voiceId: string): Promise<Uint8Array>;
}

/** Natural voice audio, stored once per (video, language, Length) and reused by everyone. */
export interface NarrationAudioStore {
  /** The public URL of stored audio, or null if there's none yet. */
  findAudio(key: string): Promise<string | null>;
  /** Stores the audio (keeping any already there) and returns its public URL. */
  saveAudio(key: string, mp3: Uint8Array): Promise<string>;
}

export interface Clock {
  now(): Date;
}
