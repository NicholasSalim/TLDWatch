import { authClient, forgetAuthUser, isSameOrigin, signedInUserId } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, orUnavailable } from "@/server/http";

/**
 * Deletes the signed-in Member's account: their personal data (through the
 * core), then their sign-in itself, then signs them out on this device.
 * Anyone signed in may call it, not only a Member with a profile, so a
 * deletion that stopped after the profile went can be finished by retrying.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const memberId = await signedInUserId().catch(() => null);
  if (!memberId) return Response.json({ error: "not-signed-in" }, { status: 401 });

  const deleted = await orUnavailable(
    "Account deletion failed",
    async () => {
      await getCore().deleteMember(memberId);
      await forgetAuthUser(memberId);
      return new Response(null, { status: 204 });
    },
    { fallback: { error: "not-deleted" } },
  );
  if (!deleted.ok) return deleted;
  // The account is gone; failing to clear this device's cookie changes nothing.
  await authClient()
    .then((client) => client.auth.signOut({ scope: "local" }))
    .catch(() => {});
  return deleted;
}
