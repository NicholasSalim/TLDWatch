/**
 * Summary engine adapter: Gemini reads the public YouTube video directly
 * from its URL and returns structured JSON. The core validates the output.
 */
import "server-only";
import { GoogleGenAI, MediaResolution } from "@google/genai";
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

export function createGeminiSummaryEngine({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}): SummaryEngine {
  const ai = new GoogleGenAI({ apiKey });

  return {
    async summarizeYouTubeVideo(videoId) {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } },
              { text: PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
          // Low resolution keeps a video's token cost down; summaries rely mostly on the audio.
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
        },
      });
      const text = response.text;
      if (!text) throw new Error(`Summary engine returned no text for ${videoId}`);
      return JSON.parse(text);
    },
  };
}
