import { isSameOrigin } from "@/server/auth";
import { normalizeLanguage } from "@/core/summary";
import { getCore } from "@/server/core";
import { forbidden, readBody, summaryResponse } from "@/server/http";

// Reading a new video can take a while; stored Summaries return at once.
export const maxDuration = 120;

export async function POST(request: Request) {
  // Only TLDWatch's own pages may ask: another site can't make its visitors'
  // browsers spend TLDWatch's Summaries.
  if (!isSameOrigin(request)) return forbidden();
  const body = await readBody(request);
  const videoUrl = body.text("videoUrl");
  const language = normalizeLanguage(body.value("language"));
  return summaryResponse(request, "Summary request failed", (requester) =>
    getCore().requestSummary({ videoUrl, requester, language }),
  );
}
