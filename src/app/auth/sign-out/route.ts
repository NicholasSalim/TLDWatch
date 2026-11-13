import { authClient, isSameOrigin } from "@/server/auth";

/** Signs out on this device only, leaving the Member's other devices signed in. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  await (await authClient()).auth.signOut({ scope: "local" });
  return Response.redirect(new URL("/", request.url), 303);
}
