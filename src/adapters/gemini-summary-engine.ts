/**
 * Summary engine adapter: Gemini reads the public YouTube video directly
 * from its URL and returns structured JSON. The core validates the output.
 */
import "server-only";
import { FileState, GoogleGenAI, MediaResolution } from "@google/genai";
import { z } from "zod";
import type { SummaryEngine } from "@/core/ports";
import { engineOutputSchema } from "@/core/summary";

const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(engineOutputSchema);
delete responseJsonSchema.$schema;

const PROMPT = `You are summarizing this YouTube video for someone deciding whether to watch it.

Write everything in English, whatever language the video is in.

Return three Lengths of the same Summary:
- "short": a quick TL;DR. A 1-2 sentence overview, 3 key points, up to 4 timestamps.
- "medium": a balanced summary. A 3-4 sentence overview, 5-7 key points, up to 8 timestamps.
- "detailed": a thorough summary. A full-paragraph overview, 8-12 key points, up to 15 timestamps.

For every Length:
- "overview": what the video is about and what it concludes.
- "keyPoints": standalone takeaways, each understandable on its own.
- "timestamps": moments in the video, as whole seconds from the start, each with a short label saying what happens there. In chronological order.
- "verdict": "worthWatching" says whether the full video is worth watching rather than reading this Summary; "deliversOnTitle" says whether the video delivers what its title promises; "explanation" gives the reasoning in 1-3 sentences.

Also return "spokenLanguage": the BCP-47 code of the main language spoken in the video (for example "en", "es", "pt-BR").`;

const UPLOAD_PROMPT = `You are summarizing this uploaded video clip for someone deciding whether to watch it. It has no title.

Write everything in English, whatever language the video is in.

Return three Lengths of the same Summary:
- "short": a quick TL;DR. A 1-2 sentence overview, 3 key points, up to 4 timestamps.
- "medium": a balanced summary. A 3-4 sentence overview, 5-7 key points, up to 8 timestamps.
- "detailed": a thorough summary. A full-paragraph overview, 8-12 key points, up to 15 timestamps.

For every Length:
- "overview": what the video is about and what it concludes.
- "keyPoints": standalone takeaways, each understandable on its own.
- "timestamps": moments in the video, as whole seconds from the start, each with a short label saying what happens there. In chronological order.
- "verdict": "worthWatching" says whether the full video is worth watching rather than reading this Summary; "deliversOnTitle" says whether the video delivers what it sets out to do; "explanation" gives the reasoning in 1-3 sentences.

Also return "spokenLanguage": the BCP-47 code of the main language spoken in the video (for example "en", "es", "pt-BR").`;

export function createGeminiSummaryEngine({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}): SummaryEngine {
  const ai = new GoogleGenAI({
    apiKey,
    // YouTube URL input and most current models are served on v1beta only.
    apiVersion: "v1beta",
    httpOptions: {
      // Stay inside the core's generation deadline: one quick retry for a
      // transient overload, instead of the SDK's default minutes of backoff.
      timeout: 80_000,
      retryOptions: { attempts: 2, initialDelay: 2, maxDelay: 5 },
    },
  });

  // Uploads: 90s to send, up to 60s processing, 90s to read. That's 240s at most, so the
  // engine always finishes (and deletes its copy) inside the route's 300 seconds.
  const files = new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
  });

  const summarize = async (
    client: GoogleGenAI,
    part: { fileData: { fileUri: string; mimeType?: string } },
    prompt: string,
  ) => {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [part, { text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema,
        // Low resolution keeps a video's token cost down; summaries rely mostly on the audio.
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
      },
    });
    const text = response.text;
    if (!text) throw new Error("Summary engine returned no text");
    return JSON.parse(text) as unknown;
  };

  return {
    async summarizeVideoFile(video, maxDurationSeconds) {
      const mimeType = engineMimeType(video.mimeType);
      const uploaded = await files.files.upload({
        file: new Blob([video.bytes as BlobPart], { type: mimeType }),
        config: { mimeType },
      });
      const name = uploaded.name;
      if (!name) throw new Error("Summary engine gave the uploaded file no name");
      try {
        // A video is processed before it can be read: wait for it, up to 60 seconds.
        let file = uploaded;
        for (let i = 0; file.state !== FileState.ACTIVE; i++) {
          if (file.state === FileState.FAILED || i >= 30) {
            throw new Error(`Uploaded video wasn't processed: ${file.state}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
          file = await files.files.get({ name });
        }
        const duration = parseSeconds(file.videoMetadata?.videoDuration);
        if (duration !== null && duration > maxDurationSeconds) return { kind: "too-long" };
        if (!file.uri) throw new Error("Uploaded video has no URI");
        return {
          kind: "read",
          output: await summarize(files, { fileData: { fileUri: file.uri, mimeType } }, UPLOAD_PROMPT),
        };
      } finally {
        // The video is never kept, whatever happened.
        await files.files.delete({ name }).catch(() => {});
      }
    },

    async summarizeYouTubeVideo(videoId) {
      return summarize(ai, { fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } }, PROMPT);
    },
  };
}

/** Browsers call .mov files "video/quicktime"; the engine calls them "video/mov". */
function engineMimeType(browserType: string): string {
  return browserType.toLowerCase() === "video/quicktime" ? "video/mov" : browserType;
}

/** "123.4s" (how the engine reports a video's length) in seconds, or null if absent. */
function parseSeconds(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) ? seconds : null;
}
