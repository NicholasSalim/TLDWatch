/**
 * Narration: what is read aloud for a Summary, as a list of short chunks.
 * Chrome cuts some voices off after about 15 seconds, so a chunk stays short
 * enough to finish in that time even at 0.75× speed.
 */
import type { LengthContent } from "./summary";

const MAX_CHUNK = 150;

/** The overview, then each Key point, then the Verdict. Timestamps aren't read. */
export function narrationScript(content: LengthContent): string[] {
  return [content.overview, ...content.keyPoints, content.verdict.explanation].flatMap(chunk);
}

/** Groups pieces of text into chunks of at most MAX_CHUNK characters. */
function chunk(text: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces(text)) {
    if (current && (current + piece).trim().length > MAX_CHUNK) {
      chunks.push(current.trim());
      current = "";
    }
    current += piece;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Splits text into pieces no longer than MAX_CHUNK, preferring sentence ends,
 * then clause breaks, then spaces. Each piece keeps its trailing space.
 */
function pieces(text: string): string[] {
  // Sentence ends: Latin, CJK, Hindi (।) and Arabic or Urdu (؟ ۔).
  const sentences = splitAfter(text, /[.!?。！？।؟۔]+\s*/g);
  return sentences.flatMap((sentence) => {
    if (sentence.trim().length <= MAX_CHUNK) return [sentence];
    const clauses = splitAfter(sentence, /[,;:،、，；]\s*/g);
    return clauses.flatMap((clause) => {
      if (clause.trim().length <= MAX_CHUNK) return [clause];
      return splitAfter(clause, /\s+/g).flatMap(hardCut);
    });
  });
}

/** Splits after each match, keeping the match with the piece before it. */
function splitAfter(text: string, separator: RegExp): string[] {
  const result: string[] = [];
  let start = 0;
  for (const match of text.matchAll(separator)) {
    const end = match.index + match[0].length;
    if (end > start) result.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) result.push(text.slice(start));
  return result;
}

/** Last resort for a run with no break at all, such as a very long word. */
function hardCut(text: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) result.push(text.slice(i, i + MAX_CHUNK));
  return result;
}
