import { getCore } from "@/server/core";

/** Whether the Natural voice can make new audio this month, and when that resets. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    return Response.json(await getCore().naturalVoiceAllowance(), { headers });
  } catch (error) {
    console.error("Couldn't read the Natural voice allowance", error);
    return Response.json(null, { status: 503, headers });
  }
}
