/**
 * Wires the core to its production adapters. One instance per server
 * process, so simultaneous requests in that process share in-flight work.
 * Adapters are built on first use, so a request the core rejects up front
 * (a bad Video URL) never depends on service configuration.
 */
import "server-only";
import { createElevenLabsNaturalVoice } from "@/adapters/elevenlabs-natural-voice";
import { createGeminiSummaryEngine } from "@/adapters/gemini-summary-engine";
import { createGeminiTranslator } from "@/adapters/gemini-translator";
import { createSupabaseHistoryStore } from "@/adapters/supabase-history-store";
import { naturalVoiceSettings } from "@/server/natural-voices";
import { createSupabaseMemberStore } from "@/adapters/supabase-member-store";
import { createSupabaseNarrationAudioStore } from "@/adapters/supabase-narration-audio-store";
import { createSupabaseSummaryStore } from "@/adapters/supabase-summary-store";
import { createSupabaseUsageCounters } from "@/adapters/supabase-usage-counters";
import { createYouTubeVideoCatalog } from "@/adapters/youtube-video-catalog";
import { createCore, DEFAULT_LIMITS, type Core, type UsageLimits } from "@/core/core";
import type {
  NarrationAudioStore,
  NaturalVoice,
  HistoryStore,
  MemberStore,
  SummaryEngine,
  SummaryStore,
  Translator,
  UsageCounters,
  VideoCatalog,
} from "@/core/ports";

const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash";

const engine = once(() =>
  createGeminiSummaryEngine({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: geminiModel(),
  }),
);

const translator = once(() =>
  createGeminiTranslator({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: geminiModel(),
  }),
);

const catalog = once(() =>
  createYouTubeVideoCatalog({ apiKey: requireEnv("YOUTUBE_API_KEY") }),
);

const store = once(() =>
  createSupabaseSummaryStore({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

const usage = once(() =>
  createSupabaseUsageCounters({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

const members = once(() =>
  createSupabaseMemberStore({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

const history = once(() =>
  createSupabaseHistoryStore({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

const naturalVoice = once(() =>
  createElevenLabsNaturalVoice({ apiKey: requireEnv("ELEVENLABS_API_KEY"), ...naturalVoiceSettings() }),
);

const narrationAudio = once(() =>
  createSupabaseNarrationAudioStore({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

/** Limits come from the environment, falling back to the core's defaults. */
function limitsFromEnv(): UsageLimits {
  return {
    guestDailySummaries: intEnv("GUEST_DAILY_SUMMARIES", DEFAULT_LIMITS.guestDailySummaries),
    guestDailySummariesPerIp: intEnv(
      "GUEST_DAILY_SUMMARIES_PER_IP",
      DEFAULT_LIMITS.guestDailySummariesPerIp,
    ),
    memberDailySummaries: intEnv("MEMBER_DAILY_SUMMARIES", DEFAULT_LIMITS.memberDailySummaries),
    dailyVideoMinutes: intEnv("DAILY_VIDEO_MINUTES", DEFAULT_LIMITS.dailyVideoMinutes),
  };
}

export const getCore: () => Core = once(() =>
  createCore({
    engine: {
      summarizeYouTubeVideo: (videoId) => engine().summarizeYouTubeVideo(videoId),
    } satisfies SummaryEngine,
    translator: {
      translateSummary: (lengths, target) => translator().translateSummary(lengths, target),
    } satisfies Translator,
    catalog: {
      lookUpVideo: (videoId) => catalog().lookUpVideo(videoId),
    } satisfies VideoCatalog,
    store: {
      findSummary: (videoId, language) => store().findSummary(videoId, language),
      findSummaries: (videoIds, language) => store().findSummaries(videoIds, language),
      saveSummary: (summary) => store().saveSummary(summary),
    } satisfies SummaryStore,
    usage: {
      tryUse: (counter, day, amount, limit) => usage().tryUse(counter, day, amount, limit),
      giveBack: (counter, day, amount) => usage().giveBack(counter, day, amount),
      used: (counter, day) => usage().used(counter, day),
    } satisfies UsageCounters,
    members: {
      findMember: (id) => members().findMember(id),
      createMember: (member) => members().createMember(member),
      setAutoplay: (id, on) => members().setAutoplay(id, on),
    } satisfies MemberStore,
    history: {
      recordOpened: (entry) => history().recordOpened(entry),
      listHistory: (memberId, limit, before) => history().listHistory(memberId, limit, before),
      removeEntry: (memberId, videoId) => history().removeEntry(memberId, videoId),
    } satisfies HistoryStore,
    voice: {
      // Read from settings, so the API key is only needed to actually speak.
      voicesFor: (languageCode) => naturalVoiceSettings().voicesFor(languageCode),
      get model() {
        return naturalVoiceSettings().model;
      },
      synthesize: (text, languageCode, voiceId) =>
        naturalVoice().synthesize(text, languageCode, voiceId),
    } satisfies NaturalVoice,
    narrationAudio: {
      findAudio: (key) => narrationAudio().findAudio(key),
      saveAudio: (key, mp3) => narrationAudio().saveAudio(key, mp3),
    } satisfies NarrationAudioStore,
    naturalVoiceMonthlyCharacters: intEnv("NATURAL_VOICE_MONTHLY_CHARACTERS", 8_000),
    clock: { now: () => new Date() },
    limits: limitsFromEnv(),
    onFailure: (error, { videoId }) =>
      console.error(`Summary failed for ${videoId}: ${describeError(error)}`, error),
  }),
);

function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

// Store errors are plain objects, which loggers print as `{}`.
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a whole number, got "${raw}"`);
  }
  return value;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
