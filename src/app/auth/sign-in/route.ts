import { authClient, isSameOrigin, safeNext } from "@/server/auth";

/**
 * Starts Google sign-in. A plain form posts here; "adult" is the "I'm 18 or
 * older" checkbox, carried through Google to the callback.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  // Only our own sign-in dialog may start this, never a form on another site.
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });

  const form = await request.formData();
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNext(String(form.get("next") ?? "/"), origin));
  if (form.get("adult") === "on") callback.searchParams.set("adult", "1");

  try {
    const { data, error } = await (await authClient()).auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error("No Google sign-in URL");
    return Response.redirect(data.url, 303);
  } catch (error) {
    console.error("Google sign-in couldn't start", error);
    return Response.redirect(new URL("/", origin), 303);
  }
}
