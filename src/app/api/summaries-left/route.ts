import { connection } from "next/server";
import { requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";
import { NO_STORE, orUnavailable } from "@/server/http";

/** How many new Summaries the Guest or Member may still make today. */
export async function GET(request: Request) {
  // Per visitor (it reads their cookie): never prerendered at build time.
  await connection();
  return orUnavailable(
    "Summaries-left lookup failed",
    async () =>
      Response.json(await getCore().summariesLeftToday(await requesterFrom(request)), { headers: NO_STORE }),
    { fallback: null },
  );
}
