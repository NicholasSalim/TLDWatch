/**
 * The Summary: one video condensed in one language, with content for each
 * Length. The Summary engine's raw output is checked against
 * `engineOutputSchema` before anything is stored.
 */
import { z } from "zod";

export const LENGTHS = ["short", "medium", "detailed"] as const;
export type Length = (typeof LENGTHS)[number];

const timestampSchema = z.object({
  seconds: z.number().int().nonnegative(),
  label: z.string().min(1),
});

const verdictSchema = z.object({
  worthWatching: z.boolean(),
  deliversOnTitle: z.boolean(),
  explanation: z.string().min(1),
});

const lengthContentSchema = z.object({
  overview: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  timestamps: z.array(timestampSchema),
  verdict: verdictSchema,
});

export const engineOutputSchema = z.object({
  /** BCP-47 code of the language spoken in the video, e.g. "en" or "pt-BR". */
  spokenLanguage: z.string().min(2).max(35),
  lengths: z.object({
    short: lengthContentSchema,
    medium: lengthContentSchema,
    detailed: lengthContentSchema,
  }),
});

export type LengthContent = z.infer<typeof lengthContentSchema>;
export type SummaryLanguage = "english";

export type Summary = {
  videoId: string;
  language: SummaryLanguage;
  spokenLanguage: string;
  lengths: Record<Length, LengthContent>;
  createdAt: string;
};
