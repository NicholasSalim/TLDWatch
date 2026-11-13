import { getCore } from "@/server/core";
import { requesterFrom } from "@/server/auth";

/** How many new Summaries the Guest or Member may still make today. */
export async function GET(request: Request) {
  try {
    const requester = await requesterFrom(request);
    return Response.json(await getCore().summariesLeftToday(requester), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Summaries-left lookup failed", error);
    return Response.json(null, { status: 503 });
  }
}
