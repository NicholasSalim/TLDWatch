/**
 * Wires the core to its production adapters. One instance per server
 * process, so simultaneous requests in that process share in-flight work.
 * Adapters are built on first use, so a request the core rejects up front
 * (a bad Video URL) never depends on service configuration.
 */
import "server-only";
import { createGeminiSummaryEngine } from "@/adapters/gemini-summary-engine";
import { createSupabaseSummaryStore } from "@/adapters/supabase-summary-store";
import { createCore, type Core } from "@/core/core";
import type { SummaryEngine, SummaryStore } from "@/core/ports";

const engine = once(() =>
  createGeminiSummaryEngine({
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: process.env.GEMINI_MODEL || "gemini-flash-latest",
  }),
);

const store = once(() =>
  createSupabaseSummaryStore({
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),
);

export const getCore: () => Core = once(() =>
  createCore({
    engine: {
      summarizeYouTubeVideo: (videoId) => engine().summarizeYouTubeVideo(videoId),
    } satisfies SummaryEngine,
    store: {
      findSummary: (videoId, language) => store().findSummary(videoId, language),
      saveSummary: (summary) => store().saveSummary(summary),
    } satisfies SummaryStore,
    clock: { now: () => new Date() },
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
