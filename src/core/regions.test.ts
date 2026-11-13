import { describe, expect, it } from "vitest";
import { isRestrictedRegion } from "./regions";

describe("restricted regions", () => {
  it.each(["DE", "FR", "IE", "PL", "SE", "GR", "CY", "MT", "IS", "LI", "NO", "GB", "CH"])(
    "turns away visitors from %s (EU, EEA, UK or Switzerland)",
    (country) => {
      expect(isRestrictedRegion(country)).toBe(true);
    },
  );

  it.each(["GF", "GP", "MQ", "RE", "YT", "MF", "AX"])(
    "turns away visitors from %s, an EU territory reported under its own code",
    (country) => {
      expect(isRestrictedRegion(country)).toBe(true);
    },
  );

  it.each(["GI", "JE", "GG", "IM"])(
    "turns away visitors from %s too, to be safe (a UK Crown Dependency or Overseas Territory)",
    (country) => {
      expect(isRestrictedRegion(country)).toBe(true);
    },
  );

  it.each(["US", "ID", "KR", "BR", "JP", "TR", "UA", "RS", "AL"])("welcomes visitors from %s", (country) => {
    expect(isRestrictedRegion(country)).toBe(false);
  });

  it("reads codes in any case", () => {
    expect(isRestrictedRegion("de")).toBe(true);
  });

  it("lets a visitor through when the country is unknown", () => {
    expect(isRestrictedRegion(null)).toBe(false);
    expect(isRestrictedRegion("")).toBe(false);
  });
});
