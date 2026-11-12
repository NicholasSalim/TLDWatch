import type { SummariesLeft, SummaryResult } from "@/core/core";

/** What POST /api/summaries returns. */
export type SummaryResponse = SummaryResult & { summariesLeft?: SummariesLeft };
