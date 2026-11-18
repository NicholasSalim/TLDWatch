import { isSameOrigin, signedInUserId } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, orUnavailable, readBody } from "@/server/http";

/** Saves a Member's autoplay setting to their account. */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const userId = await signedInUserId().catch(() => null);
  if (!userId) return Response.json({ error: "not-signed-in" }, { status: 401 });
  const on = (await readBody(request)).value("on") === true;
  return orUnavailable(
    "Couldn't save autoplay",
    async () => {
      await getCore().setMemberAutoplay(userId, on);
      return Response.json({ autoplay: on });
    },
    { fallback: { error: "not-saved" } },
  );
}
