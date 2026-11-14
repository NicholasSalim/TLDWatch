import type { UploadStart } from "@/core/core";
import { isSameOrigin, requesterFrom } from "@/server/auth";
import { getCore } from "@/server/core";

/**
 * Starts an Upload: checks the file's size, length and type, then returns a
 * one-time URL the browser uploads it to, straight into private storage.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403 });
  const body: unknown = await request.json().catch(() => null);
  const field = (name: string): unknown =>
    body && typeof body === "object" && name in body ? (body as Record<string, unknown>)[name] : undefined;
  const number = (name: string) => {
    const value = Number(field(name));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  const mimeType = typeof field("mimeType") === "string" ? (field("mimeType") as string) : "";

  let result: UploadStart;
  try {
    // A Member, or a Guest by their signed cookie (given one now if they have none).
    result = await getCore().startUpload(await requesterFrom(request), {
      sizeBytes: number("sizeBytes"),
      durationSeconds: number("durationSeconds"),
      mimeType,
    });
  } catch (error) {
    console.error("Couldn't start an Upload", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return Response.json(result, { status: result.status === "ready" ? 200 : 422 });
}
