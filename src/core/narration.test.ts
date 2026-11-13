import { describe, expect, it } from "vitest";
import { narrationScript } from "./narration";
import type { LengthContent } from "./summary";

const content: LengthContent = {
  overview: "A short overview.",
  keyPoints: ["First point.", "Second point."],
  timestamps: [{ seconds: 95, label: "The main argument" }],
  verdict: { worthWatching: true, deliversOnTitle: false, explanation: "Worth it, mostly." },
};

describe("narrationScript", () => {
  it("reads the overview, then each Key point, then the Verdict, and skips Timestamps", () => {
    expect(narrationScript(content)).toEqual([
      "A short overview.",
      "First point.",
      "Second point.",
      "Worth it, mostly.",
    ]);
  });

  it("splits long text at sentence ends into short chunks, losing nothing", () => {
    const sentence = "This sentence is about sixty characters long, more or less. ";
    const overview = sentence.repeat(10).trim();

    const chunks = narrationScript({ ...content, overview, keyPoints: ["Point."] });
    const overviewChunks = chunks.slice(0, -2);

    expect(overviewChunks.length).toBeGreaterThan(1);
    expect(overviewChunks.every((c) => c.length <= 150)).toBe(true);
    expect(overviewChunks.join(" ")).toBe(overview);
  });

  it("keeps every chunk short enough to read in under 15 seconds at 0.75×, even one long sentence", () => {
    const longSentence = `${"and then another clause follows, ".repeat(12)}until it finally ends.`;

    const chunks = narrationScript({ ...content, overview: longSentence, keyPoints: ["Point."] });
    const overviewChunks = chunks.slice(0, -2);

    expect(overviewChunks.length).toBeGreaterThan(1);
    expect(overviewChunks.every((c) => c.length <= 150)).toBe(true);
    expect(overviewChunks.join(" ")).toBe(longSentence);
  });

  it("splits at Hindi and Arabic sentence ends too", () => {
    const hindi = "यह एक लंबा वाक्य है जिसे पढ़ने के लिए छोटे भागों में बाँटना होगा। ".repeat(5).trim();

    const overviewChunks = narrationScript({ ...content, overview: hindi, keyPoints: ["बिंदु।"] }).slice(0, -2);

    expect(overviewChunks.length).toBeGreaterThan(1);
    expect(overviewChunks.every((c) => c.endsWith("।"))).toBe(true);
  });

  it("splits at sentence ends that have no space after them, as in Japanese", () => {
    const sentence = "これは日本語の長い文章で、音声で読み上げるために分割される必要があります。";
    const overview = sentence.repeat(8);

    const overviewChunks = narrationScript({ ...content, overview, keyPoints: ["点。"] }).slice(0, -2);

    expect(overviewChunks.length).toBeGreaterThan(1);
    expect(overviewChunks.join("")).toBe(overview);
  });
});
