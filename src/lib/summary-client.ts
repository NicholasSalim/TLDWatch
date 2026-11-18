import type { Summary, SummaryLanguage } from "@/core/summary";
import type { SummaryResponse } from "@/lib/api-types";
import { getJson, postJson } from "@/lib/json-fetch";

const FAILED: SummaryResponse = { status: "rejected", reason: "summary-failed" };

/**
 * An Upload Summary in a language, for its owner; summary-failed if it isn't
 * theirs or doesn't exist. If the language couldn't be made, the server sends
 * the English one, which reads as a failed translation.
 */
export async function fetchUploadSummary(uploadId: string, language: SummaryLanguage): Promise<SummaryResponse> {
  const found = await getJson<{ summary: Summary; translationFailed: boolean } | null>(
    `/api/uploads/${encodeURIComponent(uploadId)}?lang=${encodeURIComponent(language)}`,
    null,
    { cache: "no-store" },
  );
  if (!found) return FAILED;
  return found.translationFailed
    ? { status: "ready", summary: found.summary, translationFailed: true }
    : { status: "ready", summary: found.summary };
}

/** Asks the server to summarize a pasted text. */
export function fetchTextSummary(text: string): Promise<SummaryResponse> {
  return postJson("/api/texts", { text }, FAILED);
}

/** Asks the server for a YouTube video's Summary. */
export function fetchSummary(videoUrl: string, language: SummaryLanguage = "english"): Promise<SummaryResponse> {
  return postJson("/api/summaries", { videoUrl, language }, FAILED);
}
