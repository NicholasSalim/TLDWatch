/**
 * What every route handler shares: reading a JSON body, answering a Summary
 * request, and turning an unexpected failure into a logged 503.
 */
import "server-only";
import type { SummaryResult } from "@/core/core";
import type { Requester } from "@/core/requester";
import type { SummaryResponse } from "@/lib/api-types";
import { requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";

/** For answers that belong to one visitor and must never be cached. */
export const NO_STORE = { "Cache-Control": "no-store" };

export const forbidden = () => Response.json({ error: "forbidden" }, { status: 403 });

/** A request's JSON body as typed fields; a missing or malformed body reads as empty. */
export async function readBody(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const value = (name: string) => (Object.hasOwn(fields, name) ? fields[name] : undefined);
  return {
    value,
    /** A string field, or "" if it's anything else. */
    text: (name: string) => {
      const field = value(name);
      return typeof field === "string" ? field : "";
    },
    /** A non-negative number field, or 0. */
    count: (name: string) => {
      const field = Number(value(name));
      return Number.isFinite(field) && field >= 0 ? field : 0;
    },
  };
}

/**
 * Makes a Summary for whoever is asking and answers with it, plus how many
 * new Summaries they have left today: 200 when ready, 502 when making it
 * failed, 422 when it was refused.
 */
export async function summaryResponse(
  request: Request,
  failureLabel: string,
  make: (requester: Requester) => Promise<SummaryResult>,
): Promise<Response> {
  let response: SummaryResponse;
  try {
    const requester = await requesterFrom(request);
    const result = await make(requester);
    // A failed count must never turn a Summary into an error.
    const summariesLeft = await getCore()
      .summariesLeftToday(requester)
      .catch(() => undefined);
    response = { ...result, summariesLeft };
  } catch (error) {
    console.error(failureLabel, error);
    response = { status: "rejected", reason: "summary-failed" };
  }
  const status = response.status === "ready" ? 200 : response.reason === "summary-failed" ? 502 : 422;
  return Response.json(response, { status });
}

/** Answers with `respond()`; if that fails, logs it and answers 503 with `fallback`. */
export async function orUnavailable(
  failureLabel: string,
  respond: () => Promise<Response>,
  { fallback = { error: "unavailable" } as unknown, headers }: { fallback?: unknown; headers?: HeadersInit } = {},
): Promise<Response> {
  try {
    return await respond();
  } catch (error) {
    console.error(failureLabel, error);
    return Response.json(fallback, { status: 503, headers });
  }
}
