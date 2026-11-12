/**
 * Guest identity: a signed anonymous cookie, plus a keyed hash of the IP
 * address (or its /64 network, for IPv6). The raw address is never stored.
 */
import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIPv6 } from "node:net";
import { cookies } from "next/headers";
import type { Requester } from "@/core/requester";

const COOKIE = "tldw_guest";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Reads the Guest's identity, giving them a new signed cookie if they have none. */
export async function guestFrom(request: Request): Promise<Requester> {
  const secret = process.env.GUEST_SECRET;
  if (!secret) throw new Error("Missing environment variable GUEST_SECRET");
  // Separate keys, so a cookie signature can never double as an IP hash.
  const cookieKey = hmac(secret, "guest-cookie");
  const ipKey = hmac(secret, "guest-ip");

  const jar = await cookies();
  let guestId = verify(jar.get(COOKIE)?.value, cookieKey);
  if (!guestId) {
    guestId = randomUUID();
    jar.set(COOKIE, `${guestId}.${hmac(cookieKey, guestId)}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  return { kind: "guest", guestId, ipHash: hmac(ipKey, networkOf(clientIp(request))) };
}

function hmac(key: string, value: string): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function verify(cookie: string | undefined, key: string): string | null {
  if (!cookie) return null;
  const [guestId, signature] = cookie.split(".");
  if (!guestId || !signature) return null;
  const expected = Buffer.from(hmac(key, guestId));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? guestId : null;
}

/**
 * Vercel overwrites x-forwarded-for with the Guest's real address, so its
 * first entry can be trusted there (and only there).
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

/**
 * One home connection gets a whole IPv6 /64, so the per-IP cap counts the
 * /64 network rather than each address in it.
 */
function networkOf(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const [head, tail = ""] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array(Math.max(0, missing)).fill("0"), ...tailGroups];
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
