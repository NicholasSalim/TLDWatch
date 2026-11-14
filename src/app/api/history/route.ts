import { connection } from "next/server";
import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";

const noStore = { "Cache-Control": "no-store" };

/** The signed-in Member's History, newest first; ?before=<openedAt> for older entries. */
export async function GET(request: Request) {
  // Per visitor (it reads their cookie): never prerendered at build time.
  await connection();
  const memberId = await signedInMemberId();
  if (!memberId) return Response.json({ error: "not-a-member" }, { status: 401, headers: noStore });
  const before = new URL(request.url).searchParams.get("before") ?? undefined;
  try {
    return Response.json(await getCore().listHistory(memberId, { before }), { headers: noStore });
  } catch (error) {
    console.error("Couldn't list History", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: noStore });
  }
}

/** Removes one video from the Member's History: DELETE /api/history?videoId=… */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const memberId = await signedInMemberId();
  if (!memberId) return Response.json({ error: "not-a-member" }, { status: 401 });
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  try {
    await getCore().removeFromHistory(memberId, videoId);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Couldn't remove from History", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
