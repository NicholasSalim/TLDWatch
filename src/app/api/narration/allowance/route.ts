import { getCore } from "@/server/core";
import { NO_STORE, orUnavailable } from "@/server/http";

/** Whether the Natural voice can make new audio this month, and when that resets. */
export async function GET() {
  return orUnavailable(
    "Couldn't read the Natural voice allowance",
    async () => Response.json(await getCore().naturalVoiceAllowance(), { headers: NO_STORE }),
    { fallback: null, headers: NO_STORE },
  );
}
