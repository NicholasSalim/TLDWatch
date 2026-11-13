import type { SummaryLanguage } from "./summary";

/**
 * The path of a YouTube Summary's share link: "/v/dQw4w9WgXcQ" for English,
 * "/v/dQw4w9WgXcQ?lang=original" for the original language.
 */
export function sharePath(videoId: string, language: SummaryLanguage = "english"): string {
  return language === "original" ? `/v/${videoId}?lang=original` : `/v/${videoId}`;
}
