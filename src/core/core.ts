/**
 * The TLDWatch core: every business rule, free of any framework.
 * Route handlers turn requests into calls here and results into responses.
 */
import { DURATION_LIMIT_MINUTES } from "./limits";
import { narrationScript } from "./narration";
import type {
  UploadStorage,
  Clock,
  NarrationAudioStore,
  NaturalVoice,
  HistoryStore,
  Member,
  MemberStore,
  SummaryEngine,
  SummaryStore,
  Translator,
  UsageCounters,
  VideoCatalog,
} from "./ports";
import type { Requester } from "./requester";
import {
  baseLanguage,
  engineOutputSchema,
  normalizeLanguage,
  isEnglish,
  textLanguageOf,
  LENGTHS,
  translationSchema,
  type Length,
  type Translation,
  type LengthContent,
  type Summary,
  type SummaryLanguage,
} from "./summary";
import { isUploadId } from "./upload-id";
import { isVideoId, parseVideoUrl, type VideoUrlRejection } from "./video-url";

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
  translator: Translator;
  catalog: VideoCatalog;
  store: SummaryStore;
  usage: UsageCounters;
  members: MemberStore;
  history: HistoryStore;
  voice: NaturalVoice;
  narrationAudio: NarrationAudioStore;
  uploads: UploadStorage;
  clock: Clock;
  /** Makes Upload ids; a random UUID unless a test supplies its own. */
  newId?: () => string;
  /** The largest Upload accepted, in megabytes. */
  uploadMaxMb?: number;
  /** Other languages Members may read a Summary in, as base codes ("id", "es"). */
  summaryLanguages?: string[];
  /** Natural voice characters the whole app may use per calendar month. */
  naturalVoiceMonthlyCharacters?: number;
  limits?: UsageLimits;
  /**
   * How long reading a video may take before it counts as failed. Without
   * it, a hung engine call would leave every request for that video waiting.
   */
  generationTimeoutMs?: number;
  /** How long translating a Summary may take. Short: it's text only. */
  translationTimeoutMs?: number;
  /** Told about each failed request, for server-side logging. Never shown to users. */
  onFailure?: (error: unknown, context: { videoId: string }) => void;
};

export type SummaryRequest = {
  videoUrl: string;
  requester: Requester;
  /** English (the default), the video's spoken language ("original"), or a configured code. */
  language?: SummaryLanguage;
};

export type SummaryRejection =
  | {
      status: "rejected";
      reason:
        | VideoUrlRejection
        | "video-unavailable"
        | "video-not-finished"
        | "summary-failed"
        | "language-members-only"
        | "language-not-offered"
        | "upload-members-only"
        | "upload-not-found";
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

export type SummaryResult =
  | {
      status: "ready";
      summary: Summary;
      /** Set when another language was asked for but couldn't be made: this is English. */
      translationFailed?: true;
    }
  | SummaryRejection;

export type NarrationRequest = {
  videoId: string;
  language: SummaryLanguage;
  length: Length;
  requester: Requester;
  /** Which Natural voice a Member chose; the default if missing or unknown. */
  naturalVoiceId?: string;
};

export type NarrationResult =
  | { voice: "natural"; audioUrl: string }
  | {
      voice: "standard";
      reason:
        | "guest"
        | "allowance-used-up"
        | "natural-voice-unavailable"
        | "no-summary"
        | "upload-not-eligible";
    };

export type NaturalVoiceAllowance = { charactersLeft: number; resetsAt: string };

const NATURAL_VOICE_CHARACTERS = "app:natural-voice-characters";

/**
 * A last-resort limit on sending a file to the engine, waiting for it to be
 * processed and reading it. The engine's own limits finish well before this, so
 * it can always delete its copy; this sits just inside the route's 5 minutes.
 */
const UPLOAD_TIMEOUT_MS = 280_000;

/** Making one audio may take this long, inside the narration route's 60 seconds. */
const SYNTHESIS_TIMEOUT_MS = 30_000;

/** How long a server waits for audio another server is making: 25 × 1s. */
const CLAIM_WAIT_POLLS = 25;
const CLAIM_WAIT_INTERVAL_MS = 1_000;

/** How many History entries come back at a time. */
const HISTORY_PAGE = 50;

export type HistoryItem = {
  videoId: string;
  language: SummaryLanguage;
  openedAt: string;
  /** The Short overview, to recognise the video by. */
  preview: string;
};

export type UploadStart =
  | { status: "ready"; uploadId: string; uploadUrl: string }
  | { status: "rejected"; reason: "upload-members-only" | "upload-not-a-video" }
  | { status: "rejected"; reason: "upload-too-large"; limitMb: number }
  | { status: "rejected"; reason: "video-too-long"; limitMinutes: number }
  | { status: "rejected"; reason: "daily-limit-reached"; resetsAt: string };

/** Video formats the engine can read, as browsers name them. */
const UPLOAD_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/mov",
  "video/webm",
  "video/x-msvideo",
  "video/avi",
  "video/x-flv",
  "video/x-ms-wmv",
  "video/wmv",
  "video/3gpp",
]);

/** How long an uploaded file may wait to be summarized before it's swept away. */
const ABANDONED_UPLOAD_MS = 60 * 60 * 1000;

/** Where a Member's Upload waits: their own folder, so nobody else can name it. */
function uploadPath(memberId: string, uploadId: string): string {
  return `${memberId}/${uploadId}`;
}

export type JoinResult =
  | { status: "member"; member: Member }
  | { status: "rejected"; reason: "adult-confirmation-required" };

export type SummariesLeft = { left: number; dailyLimit: number; resetsAt: string };

/** How a generation ended. */
type Generation =
  | { kind: "read"; summary: Summary }
  | { kind: "found"; summary: Summary }
  | { kind: "failed"; videoMayHaveBeenRead: boolean };

const APP_VIDEO_MINUTES = "app:video-minutes";

/** Every Summary is made in English; original-language ones come with translation. */
const SUMMARY_LANGUAGE: SummaryLanguage = "english";

/** An amount reserved on one usage counter, given back if the request fails. */
type Reservation = { counter: string; amount: number; limit: number };

export function createCore({
  engine,
  translator,
  catalog,
  summaryLanguages = [],
  store,
  usage,
  members,
  history,
  voice,
  narrationAudio,
  uploads,
  clock,
  newId = () => globalThis.crypto.randomUUID(),
  // Supabase Storage's largest file on the free plan; well within the engine's own limit.
  uploadMaxMb = 50,
  // Below ElevenLabs' free 10,000 credits a month.
  naturalVoiceMonthlyCharacters = 8_000,
  limits = DEFAULT_LIMITS,
  // Reading plus translating must fit inside the route's 120 seconds.
  generationTimeoutMs = 85_000,
  translationTimeoutMs = 30_000,
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
      const existing = await store.findSummary(videoId, SUMMARY_LANGUAGE);
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
        language: SUMMARY_LANGUAGE,
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

  async function requestSummary({
    videoUrl,
    requester,
    language = "english",
  }: SummaryRequest): Promise<SummaryResult> {
    const result = await summaryIn(normalizeLanguage(language), videoUrl, requester);
    if (result.status === "ready" && requester.kind === "member") {
      const { videoId, language: shown } = result.summary;
      await remember(requester.memberId, videoId, shown).catch((error) =>
        onFailure?.(error, { videoId }),
      );
    }
    return result;
  }

  async function summaryIn(
    language: SummaryLanguage,
    videoUrl: string,
    requester: Requester,
  ): Promise<SummaryResult> {
    // Another language: only the configured ones, and only for Members.
    const target = language;
    if (target !== "english" && target !== "original") {
      if (!summaryLanguages.includes(target)) {
        return { status: "rejected", reason: "language-not-offered" };
      }
      if (requester.kind !== "member") {
        return { status: "rejected", reason: "language-members-only" };
      }
    }

    const english = await requestEnglishSummary(videoUrl, requester);
    if (target === "english" || english.status !== "ready") return english;
    const translated = await translateOnce(english.summary, target);
    // The English Summary is already made (and maybe counted): never throw it away.
    return translated
      ? { status: "ready", summary: translated }
      : { status: "ready", summary: english.summary, translationFailed: true };
  }

  // Translations under way in this process, keyed by video and language.
  const translating = new Map<string, Promise<Summary | null>>();

  /**
   * The Summary in another language, translated from the English one at most
   * once. The video's own spoken language is always its "original" Summary.
   */
  function translateOnce(english: Summary, target: SummaryLanguage): Promise<Summary | null> {
    const spoken = baseLanguage(english.spokenLanguage);
    const language = target === spoken ? "original" : target;
    // An English video's original-language Summary is the English one.
    if (language === "original" && isEnglish(english.spokenLanguage)) {
      return Promise.resolve(english);
    }
    const key = `${english.videoId}:${language}`;
    let pending = translating.get(key);
    if (!pending) {
      pending = translate(english, language).finally(() => translating.delete(key));
      translating.set(key, pending);
    }
    return pending;
  }

  /** Translates the stored English text. It never reads the video. */
  async function translate(english: Summary, language: SummaryLanguage): Promise<Summary | null> {
    const { videoId, spokenLanguage } = english;
    try {
      const existing = await store.findSummary(videoId, language);
      if (existing) return existing;
      const into = language === "original" ? spokenLanguage : language;
      const raw = await withDeadline(
        translator.translateSummary(english.lengths, into),
        translationTimeoutMs,
      );
      return await store.saveSummary({
        videoId,
        language,
        spokenLanguage,
        lengths: keepStructure(english.lengths, translationSchema.parse(raw)),
        createdAt: clock.now().toISOString(),
        // A translation of an Upload Summary is just as private.
        ...(english.ownerId && { ownerId: english.ownerId }),
      });
    } catch (error) {
      onFailure?.(error, { videoId });
      return null;
    }
  }

  async function requestEnglishSummary(
    videoUrl: string,
    requester: Requester,
  ): Promise<SummaryResult> {
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
      const existing = await store.findSummary(videoId, SUMMARY_LANGUAGE);
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

  /**
   * Opens a stored Summary from its share link. It only reads: it never makes
   * or translates a Summary, looks a video up or counts against any limit. A YouTube Summary's
   * share id is its video ID; Uploads have none, so they can't be shared.
   */
  async function readSharedSummary(
    shareId: string,
    requested: string = "english",
  ): Promise<Summary | null> {
    if (!isVideoId(shareId)) return null;
    const language = normalizeLanguage(requested);
    const found = await store.findSummary(shareId, language);
    // Belt and braces: an Upload Summary is never shared.
    if (found?.ownerId) return null;
    if (found || language === "english" || language === "original") return found;
    // The video's own language as a code ("ko" for a Korean video) is its original Summary.
    const english = await store.findSummary(shareId, "english");
    return english && baseLanguage(english.spokenLanguage) === language
      ? store.findSummary(shareId, "original")
      : null;
  }

  /**
   * Signs someone in as a Member after Google sign-in. Someone new must have
   * confirmed they're 18 or older; a returning Member isn't asked again.
   */
  async function joinAsMember({
    memberId,
    confirmedAdult,
  }: {
    memberId: string;
    confirmedAdult: boolean;
  }): Promise<JoinResult> {
    const existing = await members.findMember(memberId);
    if (existing) return { status: "member", member: existing };
    if (!confirmedAdult) return { status: "rejected", reason: "adult-confirmation-required" };
    const member = await members.createMember({
      id: memberId,
      adultConfirmedAt: clock.now().toISOString(),
      autoplay: false,
    });
    return { status: "member", member };
  }

  /** A Member's saved settings, or null if they never joined. */
  async function memberSettings(memberId: string): Promise<{ autoplay: boolean } | null> {
    const member = await members.findMember(memberId);
    return member && { autoplay: member.autoplay };
  }

  async function setMemberAutoplay(memberId: string, on: boolean): Promise<void> {
    await members.setAutoplay(memberId, on);
  }

  /**
   * Notes that a Member opened a Summary, adding it to their History or
   * moving it to the top. Guests have no History; unknown Summaries are ignored.
   * Never fails the request it belongs to.
   */
  async function recordOpened(
    requester: Requester,
    videoId: string,
    requestedLanguage: string,
  ): Promise<void> {
    if (requester.kind !== "member") return;
    if (!isVideoId(videoId) && !isUploadId(videoId)) return;
    const language = normalizeLanguage(requestedLanguage);
    try {
      const summary = await store.findSummary(videoId, language);
      // Only the owner's History may hold an Upload.
      if (!summary || (summary.ownerId && summary.ownerId !== requester.memberId)) return;
      await remember(requester.memberId, videoId, language);
    } catch (error) {
      onFailure?.(error, { videoId });
    }
  }

  /** Writes the History entry for a Summary already known to exist. */
  async function remember(memberId: string, videoId: string, language: SummaryLanguage) {
    await history.recordOpened({ memberId, videoId, language, openedAt: clock.now().toISOString() });
  }

  /**
   * A Member's History, newest first, each with a short preview to recognise
   * it by. Pass the oldest `openedAt` shown as `before` for the next page.
   */
  async function listHistory(
    memberId: string,
    { before }: { before?: string } = {},
  ): Promise<HistoryItem[]> {
    const entries = await history.listHistory(memberId, HISTORY_PAGE, before);
    // One batched read per language, plus English for anything whose language is gone.
    const languages = [...new Set(entries.map((e) => e.language))];
    const found = await Promise.all(
      [...new Set<SummaryLanguage>(["english", ...languages])].map(async (lang) => {
        const ids = entries.filter((e) => lang === "english" || e.language === lang).map((e) => e.videoId);
        return [lang, new Map((await store.findSummaries(ids, lang)).map((s) => [s.videoId, s]))] as const;
      }),
    );
    const byLanguage = new Map(found);

    const items: HistoryItem[] = [];
    for (const entry of entries) {
      // The original-language Summary if it's there, else the English one.
      const summary =
        byLanguage.get(entry.language)?.get(entry.videoId) ??
        byLanguage.get("english")?.get(entry.videoId);
      if (!summary) {
        // Its Summary is gone: forget the entry rather than keep a dead link.
        await history.removeEntry(memberId, entry.videoId).catch(() => {});
        continue;
      }
      items.push({
        videoId: entry.videoId,
        language: summary.language,
        openedAt: entry.openedAt,
        preview: summary.lengths.short.overview,
      });
    }
    return items;
  }

  async function removeFromHistory(memberId: string, videoId: string): Promise<void> {
    await history.removeEntry(memberId, videoId);
  }

  // Natural voice audio being made in this process, keyed by its storage key.
  const narrating = new Map<string, Promise<NarrationResult>>();

  /**
   * Narration for the Summary, Length and language on screen. Members get the
   * Natural voice: stored audio if it exists (free), else new audio within
   * the month's shared allowance. Everyone else, or once the allowance is
   * used up, gets the Standard voice.
   */
  async function requestNarration({
    videoId,
    language: requestedLanguage,
    length,
    requester,
    naturalVoiceId,
  }: NarrationRequest): Promise<NarrationResult> {
    if (requester.kind !== "member") return { voice: "standard", reason: "guest" };
    // Natural voice audio is public, and an Upload Summary is private.
    if (isUploadId(videoId)) return { voice: "standard", reason: "upload-not-eligible" };
    if (!isVideoId(videoId)) return { voice: "standard", reason: "no-summary" };

    const language = normalizeLanguage(requestedLanguage);
    let summary: Summary | null;
    try {
      summary = await store.findSummary(videoId, language);
    } catch (error) {
      onFailure?.(error, { videoId });
      return { voice: "standard", reason: "natural-voice-unavailable" };
    }
    if (!summary) return { voice: "standard", reason: "no-summary" };

    // A voice native to the language being read; anything not on its list gets the default.
    const languageCode = textLanguageOf(summary);
    const allowed = voice.voicesFor(languageCode);
    const voiceId =
      naturalVoiceId && allowed.includes(naturalVoiceId) ? naturalVoiceId : allowed[0];
    // Voice and model are part of the key, so changing either never replays old audio.
    const key = `${videoId}/${language}/${length}/${voiceId}-${voice.model}.mp3`;
    let pending = narrating.get(key);
    if (!pending) {
      const text = narrationScript(summary.lengths[length]).join(" ");
      pending = narrate({ key, videoId, text, languageCode, voiceId }).finally(() =>
        narrating.delete(key),
      );
      narrating.set(key, pending);
    }
    return pending;
  }

  async function narrate({
    key,
    videoId,
    text,
    languageCode,
    voiceId,
  }: {
    key: string;
    videoId: string;
    text: string;
    languageCode: string;
    voiceId: string;
  }): Promise<NarrationResult> {
    const month = utcMonth(clock.now());
    const claim = `narration-claim:${key}`;
    let claimed = false;
    let characters = 0;
    try {
      const stored = await narrationAudio.findAudio(key);
      if (stored) return { voice: "natural", audioUrl: stored };

      // Only one server makes each audio; the others wait for it to appear.
      if (!(await usage.tryUse(claim, month, 1, 1))) return await waitForAudio(key);
      claimed = true;

      if (!(await usage.tryUse(NATURAL_VOICE_CHARACTERS, month, text.length, naturalVoiceMonthlyCharacters))) {
        await usage.giveBack(claim, month, 1);
        return { voice: "standard", reason: "allowance-used-up" };
      }
      characters = text.length;

      const mp3 = await withDeadline(voice.synthesize(text, languageCode, voiceId), SYNTHESIS_TIMEOUT_MS);
      return { voice: "natural", audioUrl: await narrationAudio.saveAudio(key, mp3) };
    } catch (error) {
      onFailure?.(error, { videoId });
      const giveBack = async (counter: string, amount: number) =>
        usage.giveBack(counter, month, amount).catch((e) => onFailure?.(e, { videoId }));
      // A timed-out voice service may still have spoken (and charged) it.
      if (characters && !(error instanceof DeadlineExceeded)) {
        await giveBack(NATURAL_VOICE_CHARACTERS, characters);
      }
      if (claimed) await giveBack(claim, 1);
      return { voice: "standard", reason: "natural-voice-unavailable" };
    }
  }

  /** Another server is making this audio: wait a little for it to appear. */
  async function waitForAudio(key: string): Promise<NarrationResult> {
    for (let i = 0; i < CLAIM_WAIT_POLLS; i++) {
      await new Promise((resolve) => setTimeout(resolve, CLAIM_WAIT_INTERVAL_MS));
      const stored = await narrationAudio.findAudio(key);
      if (stored) return { voice: "natural", audioUrl: stored };
    }
    return { voice: "standard", reason: "natural-voice-unavailable" };
  }

  /** How many Natural voice characters are left this month, and when it resets. */
  async function naturalVoiceAllowance(): Promise<NaturalVoiceAllowance> {
    const now = clock.now();
    const used = await usage.used(NATURAL_VOICE_CHARACTERS, utcMonth(now));
    return { charactersLeft: Math.max(0, naturalVoiceMonthlyCharacters - used), resetsAt: nextUtcMonth(now) };
  }

  /**
   * Starts an Upload for a Member: checks the file before anything is sent,
   * then gives a one-time URL in their own private folder to upload it to.
   */
  async function startUpload(
    requester: Requester,
    file: { sizeBytes: number; durationSeconds: number; mimeType: string },
  ): Promise<UploadStart> {
    if (requester.kind !== "member") return { status: "rejected", reason: "upload-members-only" };
    if (!UPLOAD_VIDEO_TYPES.has(file.mimeType.toLowerCase())) {
      return { status: "rejected", reason: "upload-not-a-video" };
    }
    if (file.sizeBytes > uploadMaxMb * 1024 * 1024) {
      return { status: "rejected", reason: "upload-too-large", limitMb: uploadMaxMb };
    }
    const limitMinutes = DURATION_LIMIT_MINUTES.member;
    if (file.durationSeconds > limitMinutes * 60) {
      return { status: "rejected", reason: "video-too-long", limitMinutes };
    }
    // Say so now, not after they've waited for a 50 MB upload.
    const left = await summariesLeftToday(requester);
    if (left.left === 0) {
      return { status: "rejected", reason: "daily-limit-reached", resetsAt: left.resetsAt };
    }
    const uploadId = `upload-${newId()}`;
    const uploadUrl = await uploads.createUploadUrl(uploadPath(requester.memberId, uploadId));
    return { status: "ready", uploadId, uploadUrl };
  }

  /**
   * Summarizes a Member's uploaded file privately, then deletes it, whether
   * that worked or not. It counts toward their daily Summaries only if it worked.
   */
  // Uploads being summarized in this process, so a repeated request joins the first.
  const summarizingUploads = new Map<string, Promise<SummaryResult>>();

  function summarizeUpload(requester: Requester, uploadId: string): Promise<SummaryResult> {
    if (requester.kind !== "member") {
      return Promise.resolve({ status: "rejected", reason: "upload-members-only" });
    }
    if (!isUploadId(uploadId)) return Promise.resolve({ status: "rejected", reason: "upload-not-found" });
    const path = uploadPath(requester.memberId, uploadId);
    let pending = summarizingUploads.get(path);
    if (!pending) {
      pending = summarizeUploadOnce(requester.memberId, uploadId, path).finally(() =>
        summarizingUploads.delete(path),
      );
      summarizingUploads.set(path, pending);
    }
    return pending;
  }

  async function summarizeUploadOnce(
    memberId: string,
    uploadId: string,
    path: string,
  ): Promise<SummaryResult> {
    const member: Requester = { kind: "member", memberId };
    const now = clock.now();
    const day = utcDay(now);
    const counters = summaryCounters(member);
    let reserved = false;
    try {
      // Already summarized (the same URL used again): give that back, uncounted.
      const existing = await store.findSummary(uploadId, SUMMARY_LANGUAGE);
      if (existing?.ownerId === memberId) return { status: "ready", summary: existing };

      const file = await uploads.read(path);
      if (!file) return { status: "rejected", reason: "upload-not-found" };

      if (!(await reserveAll(counters, day, uploadId))) {
        return { status: "rejected", reason: "daily-limit-reached", resetsAt: nextUtcMidnight(now) };
      }
      reserved = true;

      const limitMinutes = DURATION_LIMIT_MINUTES.member;
      const read = await withDeadline(engine.summarizeVideoFile(file, limitMinutes * 60), UPLOAD_TIMEOUT_MS);
      if (read.kind === "too-long") {
        await giveBackAll(counters, day, uploadId);
        reserved = false;
        return { status: "rejected", reason: "video-too-long", limitMinutes };
      }
      const output = engineOutputSchema.parse(read.output);
      const summary = await store.saveSummary({
        videoId: uploadId,
        language: SUMMARY_LANGUAGE,
        spokenLanguage: output.spokenLanguage,
        lengths: output.lengths,
        createdAt: clock.now().toISOString(),
        ownerId: memberId,
      });
      await remember(memberId, uploadId, summary.language).catch((error) =>
        onFailure?.(error, { videoId: uploadId }),
      );
      return { status: "ready", summary };
    } catch (error) {
      onFailure?.(error, { videoId: uploadId });
      if (reserved) await giveBackAll(counters, day, uploadId);
      return { status: "rejected", reason: "summary-failed" };
    } finally {
      // The file is never kept, whatever happened.
      await uploads.remove(path).catch((error) => onFailure?.(error, { videoId: uploadId }));
    }
  }

  /**
   * Deletes usage counts from before last month: daily limits only need today,
   * and the Natural voice allowance this month. Keeps Guests' hashed IPs and
   * cookie IDs from piling up.
   */
  async function sweepOldUsage(): Promise<void> {
    const now = clock.now();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    await usage.forgetBefore(utcDay(lastMonth));
  }

  /** Deletes uploaded files nobody asked to summarize within the hour (a closed tab, say). */
  async function sweepAbandonedUploads(): Promise<number> {
    const cutoff = new Date(clock.now().getTime() - ABANDONED_UPLOAD_MS).toISOString();
    return uploads.removeOlderThan(cutoff);
  }

  /**
   * An Upload Summary, for its owner only, in English, the original language,
   * or another offered language (translated once, and just as private).
   */
  async function readUploadSummary(
    requester: Requester,
    uploadId: string,
    requested: string = "english",
  ): Promise<{ summary: Summary; translationFailed: boolean } | null> {
    if (requester.kind !== "member" || !isUploadId(uploadId)) return null;
    const english = await store.findSummary(uploadId, SUMMARY_LANGUAGE);
    if (!english || english.ownerId !== requester.memberId) return null;
    const language = normalizeLanguage(requested);
    if (language === "english") return { summary: english, translationFailed: false };
    if (language !== "original" && !summaryLanguages.includes(language)) {
      return { summary: english, translationFailed: true };
    }
    const translated = await translateOnce(english, language);
    return translated
      ? { summary: translated, translationFailed: false }
      : { summary: english, translationFailed: true };
  }


  /**
   * Deletes a Member and everything personal: waiting Upload files, their
   * History, their Upload Summaries (every language) and their profile with
   * its settings. Shared YouTube Summaries and their Narration audio stay, so
   * links people have shared keep working.
   */
  async function deleteMember(memberId: string): Promise<void> {
    // Explicit, even where the database would cascade, so the rule is stated
    // (and tested) here. Every step is safe to repeat, so a deletion that
    // stopped partway can simply be run again.
    await uploads.removeAllFor(memberId);
    await history.removeAllFor(memberId);
    await store.deleteOwnedBy(memberId);
    for (const { counter } of summaryCounters({ kind: "member", memberId })) {
      await usage.forget(counter);
    }
    await members.deleteMember(memberId);
  }

  return {
    deleteMember,
    startUpload,
    summarizeUpload,
    readUploadSummary,
    sweepAbandonedUploads,
    sweepOldUsage,
    requestSummary,
    requestNarration,
    naturalVoiceAllowance,
    recordOpened,
    listHistory,
    removeFromHistory,
    summariesLeftToday,
    readSharedSummary,
    joinAsMember,
    memberSettings,
    setMemberAutoplay,
  };
}

export type Core = ReturnType<typeof createCore>;

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The month's counter key: its first day as a date ("2026-11-01"). */
function utcMonth(date: Date): string {
  return `${date.toISOString().slice(0, 7)}-01`;
}

function nextUtcMonth(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

function nextUtcMidnight(date: Date): string {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * Takes only the text from a translation. Timestamp seconds and Verdict
 * answers come from the English Summary, and every list must keep its length.
 */
function keepStructure(
  english: Record<Length, LengthContent>,
  translated: Translation,
): Record<Length, LengthContent> {
  const result = {} as Record<Length, LengthContent>;
  for (const length of LENGTHS) {
    const en = english[length];
    const tr = translated[length];
    if (
      tr.keyPoints.length !== en.keyPoints.length ||
      tr.timestamps.length !== en.timestamps.length
    ) {
      throw new Error(`Translation changed the shape of the ${length} Summary`);
    }
    result[length] = {
      overview: tr.overview,
      keyPoints: tr.keyPoints,
      timestamps: en.timestamps.map((t, i) => ({ seconds: t.seconds, label: tr.timestamps[i].label })),
      verdict: { ...en.verdict, explanation: tr.verdict.explanation },
    };
  }
  return result;
}

class DeadlineExceeded extends Error {}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}
