import { getCore } from "@/server/core";
import { guestFrom } from "@/server/guest-identity";
import type { SummaryResponse } from "@/lib/api-types";

// Reading a new video can take a while; stored Summaries return at once.
export const maxDuration = 120;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const field = (name: string): unknown =>
    body && typeof body === "object" && name in body ? (body as Record<string, unknown>)[name] : undefined;
  const rawUrl = field("videoUrl");
  const videoUrl = typeof rawUrl === "string" ? rawUrl : "";
  const language = field("language") === "original" ? "original" : "english";

  let response: SummaryResponse;
  try {
    // Everyone is a Guest until sign-in exists.
    const requester = await guestFrom(request);
    const result = await getCore().requestSummary({ videoUrl, requester, language });
    // A failed count must never turn a Summary into an error.
    const summariesLeft = await getCore()
      .summariesLeftToday(requester)
      .catch(() => undefined);
    response = { ...result, summariesLeft };
  } catch (error) {
    console.error("Summary request failed", error);
    response = { status: "rejected", reason: "summary-failed" };
  }

  const status =
    response.status === "ready" ? 200 : response.reason === "summary-failed" ? 502 : 422;
  return Response.json(response, { status });
}
