import type { Me } from "@/lib/api-types";
import { authClient } from "@/server/auth";
import { getCore } from "@/server/core";

/** Who's signed in, for the header and the autoplay setting. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { data } = await (await authClient()).auth.getUser();
    const user = data.user;
    const settings = user && (await getCore().memberSettings(user.id));
    const me: Me = {
      member:
        user && settings
          ? {
              name: typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : null,
              email: user.email ?? null,
              avatarUrl:
                typeof user.user_metadata.avatar_url === "string" ? user.user_metadata.avatar_url : null,
              autoplay: settings.autoplay,
            }
          : null,
    };
    return Response.json(me, { headers });
  } catch (error) {
    console.error("Couldn't read who's signed in", error);
    return Response.json({ member: null } satisfies Me, { headers });
  }
}
