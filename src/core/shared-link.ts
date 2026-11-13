/**
 * What was shared to TLDWatch from a phone's Share menu, reduced to the one
 * thing to summarize. Apps put the link in different fields: the URL field if
 * they're tidy, otherwise somewhere in the text (the YouTube app's "Watch
 * this! https://youtu.be/…") or the title. The result then goes through
 * Video URL handling like anything pasted.
 */
export function sharedLink(shared: { url?: string | null; text?: string | null; title?: string | null }): string {
  const url = shared.url?.trim();
  if (url) return url;
  for (const field of [shared.text, shared.title]) {
    const link = field?.match(/https?:\/\/\S+/)?.[0];
    if (link) return link;
  }
  // An empty field counts as nothing: fall through to the next one.
  return (shared.text?.trim() || shared.title?.trim() || "").trim();
}
