import { authClient, forgetAuthUser, isSameOrigin, signedInUserId } from "@/server/auth";
import { getCore } from "@/server/core";

/**
 * Deletes the signed-in Member's account: their personal data (through the
 * core), then their sign-in itself, then signs them out on this device.
 * Anyone signed in may call it, not only a Member with a profile, so a
 * deletion that stopped after the profile went can be finished by retrying.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const memberId = await signedInUserId().catch(() => null);
  if (!memberId) return Response.json({ error: "not-signed-in" }, { status: 401 });

  try {
    await getCore().deleteMember(memberId);
    await forgetAuthUser(memberId);
  } catch (error) {
    console.error("Account deletion failed", error);
    return Response.json({ error: "not-deleted" }, { status: 503 });
  }
  await (await authClient()).auth.signOut({ scope: "local" }).catch(() => {});
  return new Response(null, { status: 204 });
}
