import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { normalizeLanguage } from "@/core/summary";
import { getCore } from "@/server/core";
import { forbidden, readBody } from "@/server/http";

/**
 * A Summary was opened from its share link. For a Member, this adds it to
 * their History; for anyone else it does nothing (and sets no cookie).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const body = await readBody(request);
  const memberId = await signedInMemberId();
  if (memberId) {
    await getCore().recordOpened(
      { kind: "member", memberId },
      body.text("videoId"),
      normalizeLanguage(body.value("language")),
    );
  }
  return new Response(null, { status: 204 });
}
