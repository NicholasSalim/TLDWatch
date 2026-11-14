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
  return requester.kind === "member" ? requester.memberId : `guest-${requester.guestId}`;
}

/** Whether an owner key belongs to a Guest. */
export function isGuestOwner(owner: string): boolean {
  return owner.startsWith("guest-");
}
