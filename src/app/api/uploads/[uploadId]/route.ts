import { isSameOrigin, requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, NO_STORE, orUnavailable, summaryResponse } from "@/server/http";

// Sending the file to the engine and reading it can take a few minutes.
export const maxDuration = 300;

/** Summarizes an uploaded file (POST /api/uploads/<id>), then deletes the file. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[uploadId]">) {
  if (!isSameOrigin(request)) return forbidden();
  const { uploadId } = await ctx.params;
  return summaryResponse(request, "Upload summary failed", (requester) =>
    getCore().summarizeUpload(requester, uploadId),
  );
}

/** An Upload Summary, for its owner only: GET /api/uploads/<id>?lang=original */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[uploadId]">) {
  const { uploadId } = await ctx.params;
  const lang = new URL(request.url).searchParams.get("lang") ?? "english";
  return orUnavailable(
    "Couldn't read an Upload Summary",
    async () => {
      // Its owner only: a Member, or the Guest whose cookie made it.
      const found = await getCore().readUploadSummary(await requesterFrom(request), uploadId, lang);
      // Not found and not yours look the same, so nothing leaks either way.
      return found
        ? Response.json(found, { headers: NO_STORE })
        : Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
    },
    { headers: NO_STORE },
  );
}
