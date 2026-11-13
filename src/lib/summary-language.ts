import type { SummaryLanguage } from "@/core/summary";

/**
 * Reads a Summary language from a request: "english", "original", or a base
 * language code ("id"). Anything else is English. The core decides whether a
 * code is offered and to whom.
 */
export function parseSummaryLanguage(value: unknown): SummaryLanguage {
  if (value === "original") return "original";
  if (typeof value === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value)) {
    const base = value.toLowerCase().split("-")[0];
    return base === "en" ? "english" : base;
  }
  return "english";
}
