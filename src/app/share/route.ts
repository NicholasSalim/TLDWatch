import { sharedLink } from "@/core/shared-link";

/**
 * Where the phone's Share menu sends things (see the manifest's share_target).
 * Picks the link out of what was shared and hands it to the homepage, which
 * judges it exactly as if it had been pasted.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const link = sharedLink({ url: params.get("url"), text: params.get("text"), title: params.get("title") });
  const home = new URL("/", request.url);
  if (link) home.searchParams.set("link", link);
  return Response.redirect(home, 303);
}
