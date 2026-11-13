import { connection } from "next/server";
import { summaryLanguagesFromEnv } from "@/server/summary-languages";

/** The other languages Members can read a Summary in, as base codes. */
export async function GET() {
  // Read at request time, like the core does, never frozen into the build.
  await connection();
  return Response.json(summaryLanguagesFromEnv(), { headers: { "Cache-Control": "no-store" } });
}
