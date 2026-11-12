import { getCore } from "@/server/core";
import { guestFrom } from "@/server/guest-identity";

/** How many new Summaries the Guest may still make today. */
export async function GET(request: Request) {
  try {
    const requester = await guestFrom(request);
    return Response.json(await getCore().summariesLeftToday(requester), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Summaries-left lookup failed", error);
    return Response.json(null, { status: 503 });
  }
}
