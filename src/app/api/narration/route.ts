import type { NarrationResult } from "@/core/core";
import { LENGTHS, type Length } from "@/core/summary";
import { isSameOrigin, signedInMemberId } from "@/server/auth";
import { getCore } from "@/server/core";

// Making new Natural voice audio can take a few seconds; stored audio returns at once.
export const maxDuration = 60;

/**
 * Narration for the Summary on screen. Members get Natural voice audio while
 * the month's allowance lasts; everyone else is told to use the Standard voice.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const field = (name: string): unknown =>
    body && typeof body === "object" && name in body ? (body as Record<string, unknown>)[name] : undefined;
  const rawVideoId = field("videoId");
  const rawLength = field("length");
  const rawVoice = field("naturalVoiceId");
  const videoId = typeof rawVideoId === "string" ? rawVideoId : "";
  const language = field("language") === "original" ? "original" : "english";
  const length: Length = LENGTHS.includes(rawLength as Length) ? (rawLength as Length) : "medium";

  // No Guest cookie needed: Guests always get the Standard voice.
  const memberId = await signedInMemberId();
  let result: NarrationResult;
  try {
    result = await getCore().requestNarration({
      videoId,
      language,
      length,
      requester: memberId ? { kind: "member", memberId } : { kind: "guest", guestId: "", ipHash: "" },
      naturalVoiceId: typeof rawVoice === "string" ? rawVoice : undefined,
    });
  } catch (error) {
    console.error("Narration request failed", error);
    result = { voice: "standard", reason: "natural-voice-unavailable" };
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
