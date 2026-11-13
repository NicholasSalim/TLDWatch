/** The path of a YouTube Summary's share link, e.g. "/v/dQw4w9WgXcQ". */
export function sharePath(videoId: string): string {
  return `/v/${videoId}`;
}
