import { NextResponse, type NextRequest } from "next/server";
import { isRestrictedRegion } from "@/core/regions";

/**
 * Turns away visitors from regions TLDWatch can't serve (EU/EEA, UK and
 * Switzerland), using the country Vercel adds to every request. Vercel sets
 * this header itself, so a visitor can't fake it there; locally it's absent,
 * so nobody is blocked in development.
 */
export function proxy(request: NextRequest) {
  if (!isRestrictedRegion(request.headers.get("x-vercel-ip-country"))) return NextResponse.next();

  // 451: Unavailable For Legal Reasons.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "region-not-supported" }, { status: 451 });
  }
  return NextResponse.rewrite(new URL("/unavailable", request.url), { status: 451 });
}

export const config = {
  matcher: [
    // Everything but static files, the legal pages (readable from anywhere),
    // the region page itself, and Vercel Cron (which calls from the US anyway).
    "/((?!_next/static|_next/image|favicon.ico|terms|privacy|unavailable|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
