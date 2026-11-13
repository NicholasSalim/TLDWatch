import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";

/**
 * A Summary was opened from its share link. For a Member, this adds it to
 * their History; for anyone else it does nothing (and sets no cookie).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const field = (name: string): unknown =>
    body && typeof body === "object" && name in body ? (body as Record<string, unknown>)[name] : undefined;
  const videoId = typeof field("videoId") === "string" ? (field("videoId") as string) : "";
  const language = field("language") === "original" ? "original" : "english";

  const memberId = await signedInMemberId();
  if (memberId) await getCore().recordOpened({ kind: "member", memberId }, videoId, language);
  return new Response(null, { status: 204 });
}
