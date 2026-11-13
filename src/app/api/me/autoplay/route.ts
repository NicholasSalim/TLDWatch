import { isSameOrigin, signedInUserId } from "@/server/auth";
import { getCore } from "@/server/core";

/** Saves a Member's autoplay setting to their account. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const userId = await signedInUserId().catch(() => null);
  if (!userId) return Response.json({ error: "not-signed-in" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const on = !!body && typeof body === "object" && "on" in body && body.on === true;
  try {
    await getCore().setMemberAutoplay(userId, on);
    return Response.json({ autoplay: on });
  } catch (error) {
    console.error("Couldn't save autoplay", error);
    return Response.json({ error: "not-saved" }, { status: 503 });
  }
}
