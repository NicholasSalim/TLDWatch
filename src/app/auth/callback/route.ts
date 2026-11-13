import { authClient, forgetAuthUser, safeNext } from "@/server/auth";
import { getCore } from "@/server/core";

/** Google sends people back here. Finishes sign-in, then joins them as a Member. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = new URL(safeNext(url.searchParams.get("next"), url.origin), url.origin);
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(next, 303);

  const auth = (await authClient()).auth;
  const { data, error } = await auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error("Google sign-in couldn't finish", error);
    return Response.redirect(next, 303);
  }
  const userId = data.user.id;

  try {
    const joined = await getCore().joinAsMember({
      memberId: userId,
      confirmedAdult: url.searchParams.get("adult") === "1",
    });
    if (joined.status === "member") return Response.redirect(next, 303);

    // Not confirmed 18 or older: undo the sign-in and keep nothing about them.
    await auth.signOut({ scope: "local" });
    await forgetAuthUser(userId).catch((e) => console.error("Couldn't remove refused sign-in", e));
    return Response.redirect(new URL("/auth/adult-required", url.origin), 303);
  } catch (error) {
    console.error("Couldn't join as a Member", error);
    await auth.signOut({ scope: "local" }).catch(() => {});
    return Response.redirect(new URL("/", url.origin), 303);
  }
}
