/**
 * Video catalog adapter: the YouTube Data API (v3) tells us a video's
 * privacy, live status and duration for 1 unit of its free daily quota,
 * without spending any Summary engine quota.
 */
import "server-only";
import type { VideoCatalog, VideoFacts } from "@/core/ports";

type VideosResponse = {
  items?: {
    contentDetails?: { duration?: string };
    status?: { privacyStatus?: string };
    snippet?: { liveBroadcastContent?: string };
  }[];
};

export function createYouTubeVideoCatalog({ apiKey }: { apiKey: string }): VideoCatalog {
  return {
    async lookUpVideo(videoId): Promise<VideoFacts> {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails,status,snippet");
      url.searchParams.set("id", videoId);
      url.searchParams.set(
        "fields",
        "items(contentDetails/duration,status/privacyStatus,snippet/liveBroadcastContent)",
      );
      url.searchParams.set("key", apiKey);

      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        throw new Error(`Video lookup failed for ${videoId}: HTTP ${response.status}`);
      }
      const body = (await response.json()) as VideosResponse;

      // Private and deleted videos aren't returned at all.
      const video = body.items?.[0];
      if (!video) return { found: false };

      const privacy = video.status?.privacyStatus;
      const broadcast = video.snippet?.liveBroadcastContent;
      return {
        found: true,
        privacy: privacy === "public" || privacy === "unlisted" ? privacy : "private",
        broadcast: broadcast === "live" || broadcast === "upcoming" ? broadcast : "none",
        durationSeconds: parseIsoDuration(video.contentDetails?.duration ?? "P0D"),
      };
    },
  };
}

/** Parses YouTube's ISO 8601 durations, such as "PT1H2M3S", "P1DT2H" or "P1W". */
function parseIsoDuration(duration: string): number {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration);
  if (!match) throw new Error(`Unexpected video duration "${duration}"`);
  const [, weeks = "0", days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const totalDays = Number(weeks) * 7 + Number(days);
  return ((totalDays * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds);
}
