import { LANGUAGE_CODE } from "@/core/summary";
import { naturalVoiceList } from "@/server/natural-voices";
import { orUnavailable } from "@/server/http";

/**
 * The Natural voices Members can choose from for a language, in order, with
 * names and descriptions: GET /api/narration/voices?lang=ko
 */
export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang") ?? "en";
  if (!LANGUAGE_CODE.test(lang)) return Response.json([], { status: 400 });
  return orUnavailable(
    "Couldn't list the Natural voices",
    async () =>
      Response.json(await naturalVoiceList(lang), { headers: { "Cache-Control": "public, max-age=3600" } }),
    { fallback: [] },
  );
}
