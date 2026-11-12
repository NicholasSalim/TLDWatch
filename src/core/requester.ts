/**
 * Who is asking. A Guest is known by a signed anonymous cookie (`guestId`)
 * and a keyed hash of their IP address (`ipHash`), never the raw address.
 */
export type Requester =
  | { kind: "guest"; guestId: string; ipHash: string }
  | { kind: "member"; memberId: string };
