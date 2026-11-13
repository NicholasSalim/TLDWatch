import type { SummaryLanguage } from "./summary";

/**
 * The path of a YouTube Summary's share link: "/v/dQw4w9WgXcQ" for English,
 * "/v/dQw4w9WgXcQ?lang=original" for the original language, "?lang=id" for another.
 */
export function sharePath(videoId: string, language: SummaryLanguage = "english"): string {
  return language === "english"
    ? `/v/${videoId}`
    : `/v/${videoId}?lang=${encodeURIComponent(language)}`;
}
