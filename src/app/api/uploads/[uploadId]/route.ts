import type { SummaryResponse } from "@/lib/api-types";
import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";

// Sending the file to the engine and reading it can take a few minutes.
export const maxDuration = 300;

const guest = { kind: "guest", guestId: "", ipHash: "" } as const;

/** Summarizes an uploaded file (POST /api/uploads/<id>), then deletes the file. */
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[uploadId]">) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const { uploadId } = await ctx.params;
  const memberId = await signedInMemberId();
  const requester = memberId ? ({ kind: "member", memberId } as const) : guest;

  let response: SummaryResponse;
  try {
    const result = await getCore().summarizeUpload(requester, uploadId);
    const summariesLeft = memberId
      ? await getCore()
          .summariesLeftToday(requester)
          .catch(() => undefined)
      : undefined;
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
  const memberId = await signedInMemberId();
  const headers = { "Cache-Control": "no-store" };
  try {
    const found = await getCore().readUploadSummary(
      memberId ? { kind: "member", memberId } : guest,
      uploadId,
      lang,
    );
    // Not found and not yours look the same, so nothing leaks either way.
    return found
      ? Response.json(found, { headers })
      : Response.json({ error: "not-found" }, { status: 404, headers });
  } catch (error) {
    console.error("Couldn't read an Upload Summary", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
