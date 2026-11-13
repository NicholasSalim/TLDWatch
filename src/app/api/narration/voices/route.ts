import { naturalVoiceList } from "@/server/natural-voices";

/**
 * The Natural voices Members can choose from for a language, in order, with
 * names and descriptions: GET /api/narration/voices?lang=ko
 */
export async function GET(request: Request) {
  const lang = new URL(request.url).searchParams.get("lang") ?? "en";
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) return Response.json([], { status: 400 });
  try {
    return Response.json(await naturalVoiceList(lang), {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Couldn't list the Natural voices", error);
    return Response.json([], { status: 503 });
  }
}
