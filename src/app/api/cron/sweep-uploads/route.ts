import { getCore } from "@/server/core";

/**
 * Daily housekeeping: deletes uploaded files nobody asked to summarize (a
 * closed tab, say), Guests' Upload Summaries after 30 days, and usage counts
 * older than last month. Vercel Cron calls
 * this daily (vercel.json), sending CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const removed = await getCore().sweepAbandonedUploads();
    const guestUploadsRemoved = await getCore().sweepOldGuestUploads();
    await getCore().sweepOldUsage();
    return Response.json({ removed, guestUploadsRemoved });
  } catch (error) {
    console.error("Couldn't sweep abandoned Uploads", error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
