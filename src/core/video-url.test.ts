import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "./video-url";

const ID = "dQw4w9WgXcQ";

describe("parseVideoUrl", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=abc`,
    `www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=tracking`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `  https://youtu.be/${ID}  `,
  ])("reduces %s to the same video ID", (input) => {
    expect(parseVideoUrl(input)).toEqual({ ok: true, videoId: ID });
  });

  it("rejects empty input", () => {
    expect(parseVideoUrl("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it.each(["hello", "summarize this video please", "ftp://youtube.com/watch?v=x"])(
    "rejects %s as not a link",
    (input) => {
      expect(parseVideoUrl(input)).toEqual({ ok: false, reason: "not-a-url" });
    },
  );

  it.each([
    "https://www.tiktok.com/@someone/video/7300000000000000000",
    "https://www.instagram.com/reel/Cxyz123/",
    "https://vimeo.com/123456",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
  ])("rejects %s as not YouTube", (input) => {
    expect(parseVideoUrl(input)).toEqual({ ok: false, reason: "not-youtube" });
  });

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch?v=tooshort",
    "https://youtu.be/",
  ])("rejects %s as a YouTube link with no video", (input) => {
    expect(parseVideoUrl(input)).toEqual({ ok: false, reason: "no-video-id" });
  });
});
