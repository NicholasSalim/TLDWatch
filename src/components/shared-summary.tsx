"use client";

import { useState } from "react";
import type { Length, Summary } from "@/core/summary";
import { SummaryView } from "@/components/summary-view";

/** A Summary on its own page, starting at Medium. */
export function SharedSummary({ summary }: { summary: Summary }) {
  const [length, setLength] = useState<Length>("medium");
  return (
    <SummaryView
      summary={summary}
      length={length}
      onLengthChange={setLength}
      originalRequested={false}
    />
  );
}
