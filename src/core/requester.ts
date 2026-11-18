/**
 * Who is asking. A Guest is known by a signed anonymous cookie (`guestId`)
 * and a keyed hash of their IP address (`ipHash`), never the raw address.
 */
export type Requester =
  | { kind: "guest"; guestId: string; ipHash: string }
  | { kind: "member"; memberId: string };

/**
 * Who owns an Upload, as stored: a Member's id, or "guest-" and the Guest's
 * cookie id. It names their private Storage folder too. Only the cookie
 * counts for a Guest, never the network, so Guests sharing one never share.
 */
export function ownerKey(requester: Requester): string {
  return requester.kind === "member" ? requester.memberId : guestOwnerKey(requester.guestId);
}

const GUEST_PREFIX = "guest-";

/** The owner key of a Guest's Upload. */
export function guestOwnerKey(guestId: string): string {
  return GUEST_PREFIX + guestId;
}

/** The Guest's cookie id behind an owner key, or null if a Member owns it. */
export function guestIdOf(owner: string): string | null {
  return owner.startsWith(GUEST_PREFIX) ? owner.slice(GUEST_PREFIX.length) : null;
}
