import { connection } from "next/server";
import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, NO_STORE, orUnavailable } from "@/server/http";

/** The signed-in Member's History, newest first; ?before=<openedAt> for older entries. */
export async function GET(request: Request) {
  // Per visitor (it reads their cookie): never prerendered at build time.
  await connection();
  const memberId = await signedInMemberId();
  if (!memberId) return Response.json({ error: "not-a-member" }, { status: 401, headers: NO_STORE });
  const before = new URL(request.url).searchParams.get("before") ?? undefined;
  return orUnavailable(
    "Couldn't list History",
    async () => Response.json(await getCore().listHistory(memberId, { before }), { headers: NO_STORE }),
    { headers: NO_STORE },
  );
}

/** Removes one video from the Member's History: DELETE /api/history?videoId=… */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const memberId = await signedInMemberId();
  if (!memberId) return Response.json({ error: "not-a-member" }, { status: 401 });
  const videoId = new URL(request.url).searchParams.get("videoId") ?? "";
  return orUnavailable("Couldn't remove from History", async () => {
    await getCore().removeFromHistory(memberId, videoId);
    return new Response(null, { status: 204 });
  });
}
