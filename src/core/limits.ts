import type { Requester } from "./requester";

/** The longest video, in minutes, each kind of requester may have summarized. */
export const DURATION_LIMIT_MINUTES: Record<Requester["kind"], number> = {
  guest: 15,
  member: 30,
};
