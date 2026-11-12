/** Who is asking: a Guest, or a signed-in Member. */
export type Requester = { kind: "guest" } | { kind: "member" };
