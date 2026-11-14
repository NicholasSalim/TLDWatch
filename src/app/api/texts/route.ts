import type { SummaryResponse } from "@/lib/api-types";
import { isSameOrigin, requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";

// Reading up to 100,000 characters takes a little while.
export const maxDuration = 120;

/**
 * Summarizes a pasted text (POST /api/texts with { text }), privately for
 * whoever pasted it. Its Summary opens at /u/<id>.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const raw = body && typeof body === "object" && "text" in body ? (body as { text: unknown }).text : "";
  const text = typeof raw === "string" ? raw : "";

  let response: SummaryResponse;
  try {
    const requester = await requesterFrom(request);
    const result = await getCore().summarizeText(requester, text);
    // A failed count must never turn a Summary into an error.
    const summariesLeft = await getCore()
      .summariesLeftToday(requester)
      .catch(() => undefined);
    response = { ...result, summariesLeft };
  } catch (error) {
    console.error("Text summary failed", error);
    response = { status: "rejected", reason: "summary-failed" };
  }
  const status = response.status === "ready" ? 200 : response.reason === "summary-failed" ? 502 : 422;
  return Response.json(response, { status });
}
