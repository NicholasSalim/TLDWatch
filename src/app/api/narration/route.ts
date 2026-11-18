import type { NarrationResult } from "@/core/core";
import type { Requester } from "@/core/requester";
import { LENGTHS, normalizeLanguage, type Length } from "@/core/summary";
import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, NO_STORE, readBody } from "@/server/http";

// Making new Natural voice audio can take a few seconds; stored audio returns at once.
export const maxDuration = 60;

/** Anyone not signed in: Guests always get the Standard voice, so no Guest cookie is needed. */
const ANY_GUEST: Requester = { kind: "guest", guestId: "", ipHash: "" };

/**
 * Narration for the Summary on screen. Members get Natural voice audio while
 * the month's allowance lasts; everyone else is told to use the Standard voice.
 * The core turns its own failures into the Standard voice; a server that
 * can't even start (bad configuration) answers the same, and logs why.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const body = await readBody(request);
  const length = body.value("length");
  const memberId = await signedInMemberId();
  let result: NarrationResult;
  try {
    result = await getCore().requestNarration({
      videoId: body.text("videoId"),
      language: normalizeLanguage(body.value("language")),
      length: LENGTHS.includes(length as Length) ? (length as Length) : "medium",
      requester: memberId ? { kind: "member", memberId } : ANY_GUEST,
      naturalVoiceId: body.text("naturalVoiceId") || undefined,
    });
  } catch (error) {
    console.error("Narration request failed", error);
    result = { voice: "standard", reason: "natural-voice-unavailable" };
  }
  return Response.json(result, { headers: NO_STORE });
}
