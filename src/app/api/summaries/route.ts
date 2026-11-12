import { getCore } from "@/server/core";
import type { SummaryResult } from "@/core/core";

// Reading a new video can take a while; stored Summaries return at once.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const videoUrl =
    body && typeof body === "object" && "videoUrl" in body && typeof body.videoUrl === "string"
      ? body.videoUrl
      : "";

  let result: SummaryResult;
  try {
    result = await getCore().requestSummary({ videoUrl });
  } catch (error) {
    console.error("Summary request failed", error);
    result = { status: "rejected", reason: "summary-failed" };
  }

  const status =
    result.status === "ready" ? 200 : result.reason === "summary-failed" ? 502 : 422;
  return Response.json(result, { status });
}
