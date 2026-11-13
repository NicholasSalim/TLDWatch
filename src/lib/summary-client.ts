import type { Summary, SummaryLanguage } from "@/core/summary";
import type { SummaryResponse } from "@/lib/api-types";

/**
 * An Upload Summary in a language, for its owner. If the language couldn't be
 * made, the server sends the English one, which reads as a failed translation.
 */
export async function fetchUploadSummary(
  uploadId: string,
  language: SummaryLanguage,
): Promise<SummaryResponse> {
  try {
    const response = await fetch(
      `/api/uploads/${encodeURIComponent(uploadId)}?lang=${encodeURIComponent(language)}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { summary, translationFailed } = (await response.json()) as {
      summary: Summary;
      translationFailed: boolean;
    };
    return translationFailed
      ? { status: "ready", summary, translationFailed: true }
      : { status: "ready", summary };
  } catch {
    return { status: "rejected", reason: "summary-failed" };
  }
}

/** Asks the server for a Summary. Network failures come back as summary-failed. */
export async function fetchSummary(
  videoUrl: string,
  language: SummaryLanguage = "english",
): Promise<SummaryResponse> {
  try {
    const response = await fetch("/api/summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, language }),
    });
    return (await response.json()) as SummaryResponse;
  } catch {
    return { status: "rejected", reason: "summary-failed" };
  }
}
