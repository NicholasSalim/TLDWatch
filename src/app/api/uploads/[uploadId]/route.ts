import type { SummaryResponse } from "@/lib/api-types";
import { isSameOrigin, requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";

// Sending the file to the engine and reading it can take a few minutes.
export const maxDuration = 300;

/** Summarizes an uploaded file (POST /api/uploads/<id>), then deletes the file. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[uploadId]">) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { uploadId } = await ctx.params;

  let response: SummaryResponse;
  try {
    const requester = await requesterFrom(request);
    const result = await getCore().summarizeUpload(requester, uploadId);
    const summariesLeft = await getCore()
      .summariesLeftToday(requester)
      .catch(() => undefined);
    response = { ...result, summariesLeft };
  } catch (error) {
    console.error("Upload summary failed", error);
    response = { status: "rejected", reason: "summary-failed" };
  }
  const status = response.status === "ready" ? 200 : response.reason === "summary-failed" ? 502 : 422;
  return Response.json(response, { status });
}

/** An Upload Summary, for its owner only: GET /api/uploads/<id>?lang=original */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[uploadId]">) {
  const { uploadId } = await ctx.params;
  const lang = new URL(request.url).searchParams.get("lang") ?? "english";
  const headers = { "Cache-Control": "no-store" };
  try {
    // Its owner only: a Member, or the Guest whose cookie made it.
    const found = await getCore().readUploadSummary(await requesterFrom(request), uploadId, lang);
    // Not found and not yours look the same, so nothing leaks either way.
    return found
      ? Response.json(found, { headers })
      : Response.json({ error: "not-found" }, { status: 404, headers });
  } catch (error) {
    console.error("Couldn't read an Upload Summary", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
