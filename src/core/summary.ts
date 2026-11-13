/**
 * The Summary: one video condensed in one language, with content for each
 * Length. The Summary engine's raw output is checked against
 * `engineOutputSchema` before anything is stored.
 */
import { z } from "zod";

export const LENGTHS = ["short", "medium", "detailed"] as const;
export type Length = (typeof LENGTHS)[number];

export const LENGTH_LABELS: Record<Length, string> = {
  short: "Short",
  medium: "Medium",
  detailed: "Detailed",
};

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
  spokenLanguage: z
    .string()
    .max(35)
    .regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
  lengths: z.object({
    short: lengthContentSchema,
    medium: lengthContentSchema,
    detailed: lengthContentSchema,
  }),
});

export type LengthContent = z.infer<typeof lengthContentSchema>;

/**
 * English, the language the video is spoken in ("original"), or another
 * language a Member chose from the configured list, as a base code ("id", "es").
 */
export type SummaryLanguage = "english" | "original" | (string & {});

/** The BCP-47 code a Summary is written in: "en", its spoken language, or its own code. */
export function textLanguageOf(summary: { language: SummaryLanguage; spokenLanguage: string }): string {
  if (summary.language === "english") return "en";
  if (summary.language === "original") return summary.spokenLanguage;
  return summary.language;
}

/**
 * Any language value made safe: "english", "original", or a valid base code
 * ("id" from "id-ID"). English as a code, and anything unrecognisable, is "english".
 */
export function normalizeLanguage(language: string): SummaryLanguage {
  if (language === "english" || language === "original") return language;
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) return "english";
  const base = baseLanguage(language);
  return base === "en" ? "english" : base;
}

/** The base of a language code: "pt" for "pt-BR". */
export function baseLanguage(code: string): string {
  return code.toLowerCase().split("-")[0];
}

/** Whether a BCP-47 language code is English ("en", "en-GB", ...). */
export function isEnglish(languageCode: string): boolean {
  return languageCode.toLowerCase().split("-")[0] === "en";
}

/**
 * The Translator's untrusted output: only the text of the three Lengths.
 * Timestamp seconds and Verdict answers always come from the English Summary.
 */
const translatedLengthSchema = z.object({
  overview: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  timestamps: z.array(z.object({ label: z.string().min(1) })),
  verdict: z.object({ explanation: z.string().min(1) }),
});

export const translationSchema = z.object({
  short: translatedLengthSchema,
  medium: translatedLengthSchema,
  detailed: translatedLengthSchema,
});

export type Translation = z.infer<typeof translationSchema>;

export type Summary = {
  /** The Video: a YouTube video ID, or an Upload's id ("upload-…"). */
  videoId: string;
  language: SummaryLanguage;
  spokenLanguage: string;
  lengths: Record<Length, LengthContent>;
  createdAt: string;
  /** An Upload Summary's owner: only they can read it. Absent for YouTube Summaries. */
  ownerId?: string;
};
