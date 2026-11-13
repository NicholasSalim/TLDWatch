import { describe, expect, it } from "vitest";
import { sharedLink } from "./shared-link";

describe("sharedLink", () => {
  it("uses the shared URL when there is one", () => {
    expect(sharedLink({ url: "https://youtu.be/dQw4w9WgXcQ", text: "Look", title: "A video" })).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );
  });

  it("finds the link inside shared text, as the YouTube app sends it", () => {
    expect(sharedLink({ text: "Watch this! https://youtu.be/dQw4w9WgXcQ?si=abc" })).toBe(
      "https://youtu.be/dQw4w9WgXcQ?si=abc",
    );
  });

  it("finds a link in the title when that's the only place it is", () => {
    expect(sharedLink({ title: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
  });

  it("looks at the title when the text was sent empty", () => {
    expect(sharedLink({ text: "", title: "some title" })).toBe("some title");
  });

  it("passes plain text on unchanged, so it's judged like anything pasted", () => {
    expect(sharedLink({ text: "  just some words  " })).toBe("just some words");
  });

  it("gives nothing when nothing was shared", () => {
    expect(sharedLink({})).toBe("");
  });
});
