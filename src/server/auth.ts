/**
 * Supabase Auth on the server: Google sign-in, the session cookie, and who
 * is asking. Only route handlers use it, so cookies can always be written.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Requester } from "@/core/requester";
import { getCore } from "@/server/core";
import { guestFrom } from "@/server/guest-identity";

export async function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  const jar = await cookies();
  return createServerClient(url, key, {
    // Only the server reads the session, so scripts never need to see it.
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => toSet.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  });
}

/**
 * The signed-in user's id, or null. Asks Supabase Auth itself, so a session
 * signed out elsewhere stops counting at once.
 */
export async function signedInUserId(): Promise<string | null> {
  const { data } = await (await authClient()).auth.getUser();
  return data.user?.id ?? null;
}

/** The signed-in Member's id: signed in, and joined as a Member. Otherwise null. */
export async function signedInMemberId(): Promise<string | null> {
  const userId = await signedInUserId().catch(() => null);
  if (!userId) return null;
  return (await getCore().memberSettings(userId).catch(() => null)) ? userId : null;
}

/** Who is asking: a Member if they're signed in and joined, otherwise a Guest. */
export async function requesterFrom(request: Request): Promise<Requester> {
  const memberId = await signedInMemberId();
  return memberId ? { kind: "member", memberId } : guestFrom(request);
}

/**
 * A path on this site to return to after sign-in; anything else becomes "/".
 * Parsed like a browser would (which ignores tabs and newlines), then checked
 * to still be on this origin.
 */
export function safeNext(next: string | null, origin: string): string {
  if (!next) return "/";
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

/** Whether a form post came from this site, not from a page elsewhere. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

/**
 * Removes a sign-in that never became a Member (they didn't confirm they're
 * 18 or older), so their Google details aren't kept.
 */
export async function forgetAuthUser(userId: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
