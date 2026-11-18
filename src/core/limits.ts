/**
 * TLDWatch's limits, in one place: the core enforces them, and the pages that
 * mention them read them from here. The server may override some from its
 * environment (see src/server/core.ts); the pages show these defaults.
 */
import type { Requester } from "./requester";

/** The longest video or recording, in minutes, each kind of requester may have summarized. */
export const DURATION_LIMIT_MINUTES: Record<Requester["kind"], number> = {
  guest: 15,
  member: 30,
};

export type UsageLimits = {
  /** New Summaries a Guest (one anonymous cookie) may make per UTC day. */
  guestDailySummaries: number;
  /** New Summaries all Guests behind one IP address may make per UTC day. */
  guestDailySummariesPerIp: number;
  memberDailySummaries: number;
  /** Minutes of video the whole app may read per UTC day. */
  dailyVideoMinutes: number;
};

export const DEFAULT_LIMITS: UsageLimits = {
  guestDailySummaries: 3,
  guestDailySummariesPerIp: 10,
  memberDailySummaries: 10,
  // Below the Summary engine's free 8 hours of YouTube a day.
  dailyVideoMinutes: 360,
};

/** The largest Upload, in megabytes: Supabase Storage's largest file on the free plan. */
export const UPLOAD_MAX_MB = 50;

/** Natural voice characters per month, across everyone: below ElevenLabs' free 10,000. */
export const NATURAL_VOICE_MONTHLY_CHARACTERS = 8_000;

/** History entries per page. */
export const HISTORY_PAGE_SIZE = 50;
