import { isSameOrigin, requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";
import { forbidden, orUnavailable, readBody } from "@/server/http";

/**
 * Starts an Upload: checks the file's size, length and type, then returns a
 * one-time URL the browser uploads it to, straight into private storage.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return forbidden();
  const body = await readBody(request);
  return orUnavailable("Couldn't start an Upload", async () => {
    // A Member, or a Guest by their signed cookie (given one now if they have none).
    const result = await getCore().startUpload(await requesterFrom(request), {
      sizeBytes: body.count("sizeBytes"),
      durationSeconds: body.count("durationSeconds"),
      mimeType: body.text("mimeType"),
    });
    return Response.json(result, { status: result.status === "ready" ? 200 : 422 });
  });
}
