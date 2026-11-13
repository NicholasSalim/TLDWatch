import "server-only";

/**
 * The other languages Members can read a Summary in, from SUMMARY_LANGUAGES
 * ("id,es,ru,zh"), as base codes. English is always on offer, so it's left out.
 */
export function summaryLanguagesFromEnv(): string[] {
  const codes = (process.env.SUMMARY_LANGUAGES ?? "")
    .split(",")
    .map((code) => code.trim().toLowerCase().split("-")[0])
    .filter((code) => /^[a-z]{2,3}$/.test(code) && code !== "en");
  return [...new Set(codes)];
}
