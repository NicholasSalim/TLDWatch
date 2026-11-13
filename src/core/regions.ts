/**
 * Regions TLDWatch can't serve: the Summary engine's free tier doesn't allow
 * use from the EU, the EEA, the UK or Switzerland.
 */
const RESTRICTED = new Set([
  // European Union
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // The rest of the EEA
  "IS", "LI", "NO",
  // EU territories that geo-IP reports under their own codes
  "GF", "GP", "MQ", "RE", "YT", "MF", "AX",
  // United Kingdom and Switzerland
  "GB", "CH",
  // UK Crown Dependencies and Gibraltar: not legally the UK, blocked to be safe
  "GI", "JE", "GG", "IM",
]);

/** Whether a visitor's country (ISO 3166-1 alpha-2) is one TLDWatch can't serve. Unknown is let through. */
export function isRestrictedRegion(country: string | null | undefined): boolean {
  return !!country && RESTRICTED.has(country.toUpperCase());
}
