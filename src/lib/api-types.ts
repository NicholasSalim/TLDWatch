import type { SummariesLeft, SummaryResult } from "@/core/core";

/** What POST /api/summaries returns. */
export type SummaryResponse = SummaryResult & { summariesLeft?: SummariesLeft };

/** What GET /api/me returns: the signed-in Member, or null for a Guest. */
export type Me = {
  member: {
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    autoplay: boolean;
  } | null;
};
