/**
 * Video URL handling: decides whether pasted text is a Video URL
 * (a link to a YouTube video) and reduces it to its video ID.
 * Every YouTube link form for the same video yields the same ID.
 */

export type VideoUrlRejection = "empty" | "not-a-url" | "not-youtube" | "no-video-id";

export type VideoUrlResult =
  | { ok: true; videoId: string }
  | { ok: false; reason: VideoUrlRejection };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Whether text is an 11-character YouTube video ID. */
export function isVideoId(text: string): boolean {
  return VIDEO_ID.test(text);
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const PATH_ID_PREFIXES = ["shorts", "embed", "live", "v", "e"];

export function parseVideoUrl(input: string): VideoUrlResult {
  const text = input.trim();
  if (!text) return { ok: false, reason: "empty" };

  const url = toUrl(text);
  if (!url) return { ok: false, reason: "not-a-url" };

  const host = url.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtu.be") {
    return fromCandidate(url.pathname.split("/")[1]);
  }

  if (!YOUTUBE_HOSTS.has(host)) return { ok: false, reason: "not-youtube" };

  const fromQuery = url.searchParams.get("v");
  if (url.pathname === "/watch" || fromQuery) return fromCandidate(fromQuery);

  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first && PATH_ID_PREFIXES.includes(first)) return fromCandidate(second);

  return { ok: false, reason: "no-video-id" };
}

function fromCandidate(candidate: string | null | undefined): VideoUrlResult {
  return candidate && VIDEO_ID.test(candidate)
    ? { ok: true, videoId: candidate }
    : { ok: false, reason: "no-video-id" };
}

function toUrl(text: string): URL | null {
  if (/\s/.test(text)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // A bare word like "hello" parses as a host; require a dot to count as a link.
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}
