import { describe, expect, it } from "vitest";
import { formatTimestamp, timestampUrl } from "./timestamps";

describe("Timestamps", () => {
  it.each([
    [0, "0:00"],
    [7, "0:07"],
    [95, "1:35"],
    [600, "10:00"],
    [3725, "1:02:05"],
  ])("shows %i seconds as %s", (seconds, shown) => {
    expect(formatTimestamp(seconds)).toBe(shown);
  });

  it("links to the YouTube video at that moment", () => {
    expect(timestampUrl("dQw4w9WgXcQ", 95)).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=95s");
  });
});
