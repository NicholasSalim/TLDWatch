import { isSameOrigin } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, readBody, summaryResponse } from "@/server/http";

// Reading up to 100,000 characters takes a little while.
export const maxDuration = 120;

/**
 * Summarizes a pasted text (POST /api/texts with { text }), privately for
 * whoever pasted it. Its Summary opens at /u/<id>.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const text = (await readBody(request)).text("text");
  return summaryResponse(request, "Text summary failed", (requester) =>
    getCore().summarizeText(requester, text),
  );
}
