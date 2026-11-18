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
import { createSupabaseMemberStore } from "@/adapters/supabase-member-store";
import { createSupabaseNarrationAudioStore } from "@/adapters/supabase-narration-audio-store";
import { createSupabaseSummaryStore } from "@/adapters/supabase-summary-store";
import { createSupabaseUploadStorage } from "@/adapters/supabase-upload-storage";
import { createSupabaseUsageCounters } from "@/adapters/supabase-usage-counters";
import { createYouTubeVideoCatalog } from "@/adapters/youtube-video-catalog";
import { createCore, type Core } from "@/core/core";
import { DEFAULT_LIMITS, NATURAL_VOICE_MONTHLY_CHARACTERS, UPLOAD_MAX_MB } from "@/core/limits";
import type { NaturalVoice } from "@/core/ports";
import { intEnv, requireEnv } from "@/server/env";
import { naturalVoiceSettings } from "@/server/natural-voices";
import { summaryLanguagesFromEnv } from "@/server/summary-languages";
import { supabaseAdmin } from "@/server/supabase-admin";

const gemini = () => ({
  apiKey: requireEnv("GEMINI_API_KEY"),
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
});

const synthesizer = once(() =>
  createElevenLabsNaturalVoice({ apiKey: requireEnv("ELEVENLABS_API_KEY"), ...naturalVoiceSettings() }),
);

export const getCore: () => Core = once(() =>
  createCore({
    engine: lazy(() => createGeminiSummaryEngine(gemini())),
    translator: lazy(() => createGeminiTranslator(gemini())),
    catalog: lazy(() => createYouTubeVideoCatalog({ apiKey: requireEnv("YOUTUBE_API_KEY") })),
    store: lazy(() => createSupabaseSummaryStore(supabaseAdmin())),
    usage: lazy(() => createSupabaseUsageCounters(supabaseAdmin())),
    members: lazy(() => createSupabaseMemberStore(supabaseAdmin())),
    history: lazy(() => createSupabaseHistoryStore(supabaseAdmin())),
    narrationAudio: lazy(() => createSupabaseNarrationAudioStore(supabaseAdmin())),
    uploads: lazy(() => createSupabaseUploadStorage(supabaseAdmin())),
    voice: {
      // Voices and model come from settings, so the API key is only needed to actually speak.
      voicesFor: (languageCode) => naturalVoiceSettings().voicesFor(languageCode),
      get model() {
        return naturalVoiceSettings().model;
      },
      synthesize: (text, languageCode, voiceId) => synthesizer().synthesize(text, languageCode, voiceId),
    } satisfies NaturalVoice,
    summaryLanguages: summaryLanguagesFromEnv(),
    naturalVoiceMonthlyCharacters: intEnv("NATURAL_VOICE_MONTHLY_CHARACTERS", NATURAL_VOICE_MONTHLY_CHARACTERS),
    uploadMaxMb: intEnv("UPLOAD_MAX_MB", UPLOAD_MAX_MB),
    clock: { now: () => new Date() },
    limits: {
      guestDailySummaries: intEnv("GUEST_DAILY_SUMMARIES", DEFAULT_LIMITS.guestDailySummaries),
      guestDailySummariesPerIp: intEnv("GUEST_DAILY_SUMMARIES_PER_IP", DEFAULT_LIMITS.guestDailySummariesPerIp),
      memberDailySummaries: intEnv("MEMBER_DAILY_SUMMARIES", DEFAULT_LIMITS.memberDailySummaries),
      dailyVideoMinutes: intEnv("DAILY_VIDEO_MINUTES", DEFAULT_LIMITS.dailyVideoMinutes),
    },
    onFailure: (error, { videoId }) =>
      console.error(`Summary failed for ${videoId}: ${describeError(error)}`, error),
  }),
);

function once<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

/**
 * The adapter `make()` builds, built only when one of its methods is first
 * called: a request that never reaches it never needs its configuration.
 */
function lazy<T extends object>(make: () => T): T {
  const adapter = once(make);
  return new Proxy({} as T, {
    get: (_, property) => {
      const value: unknown = Reflect.get(adapter(), property);
      return typeof value === "function" ? value.bind(adapter()) : value;
    },
  });
}

// Store errors are plain objects, which loggers print as `{}`.
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error);
}
