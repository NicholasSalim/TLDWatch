import type { SummaryLanguage } from "@/core/summary";
import type { SummaryResponse } from "@/lib/api-types";

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
