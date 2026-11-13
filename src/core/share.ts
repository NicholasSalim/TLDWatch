import type { SummaryLanguage } from "./summary";
import { isUploadId } from "./upload-id";

/** Where a Summary is opened: its share link, or an Upload's private page. */
export function summaryPath(videoId: string, language: SummaryLanguage = "english"): string {
  if (!isUploadId(videoId)) return sharePath(videoId, language);
  return language === "english"
    ? `/u/${videoId}`
    : `/u/${videoId}?lang=${encodeURIComponent(language)}`;
}

/**
 * The path of a YouTube Summary's share link: "/v/dQw4w9WgXcQ" for English,
 * "/v/dQw4w9WgXcQ?lang=original" for the original language, "?lang=id" for another.
 */
export function sharePath(videoId: string, language: SummaryLanguage = "english"): string {
  return language === "english"
    ? `/v/${videoId}`
    : `/v/${videoId}?lang=${encodeURIComponent(language)}`;
}
