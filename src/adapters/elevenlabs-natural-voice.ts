/**
 * Natural voice adapter: ElevenLabs text-to-speech, returning MP3 audio, plus
 * the names and descriptions of the voices on offer. The core decides who gets
 * it, which voices are allowed, and keeps within the monthly allowance.
 */
import "server-only";
import type { NaturalVoice } from "@/core/ports";

const API = "https://api.elevenlabs.io/v1";

export function createElevenLabsNaturalVoice({
  apiKey,
  voicesFor,
  model,
}: {
  apiKey: string;
  voicesFor: (languageCode: string) => string[];
  model: string;
}): NaturalVoice {
  // language_code is only accepted by the v2.5 models.
  const takesLanguageCode = /_v2_5$/.test(model);
  return {
    voicesFor,
    model,

    async synthesize(text, languageCode, voiceId) {
      const url = new URL(`${API}/text-to-speech/${encodeURIComponent(voiceId)}`);
      // Small, speech-quality MP3: plenty for a voice, light to store and stream.
      url.searchParams.set("output_format", "mp3_44100_64");
      const response = await fetch(url, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: model,
          // ISO 639-1, e.g. "ko" from "ko-KR": tells the model which language to speak.
          ...(takesLanguageCode && { language_code: languageCode.toLowerCase().split("-")[0] }),
        }),
        // Inside the core's 30-second deadline.
        signal: AbortSignal.timeout(28_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Natural voice failed: HTTP ${response.status} ${detail.slice(0, 300)}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}

export type VoiceDetails = { id: string; name: string; description: string | null };

type VoiceResponse = {
  voice_id: string;
  name?: string;
  labels?: Partial<Record<"accent" | "description" | "gender" | "age" | "descriptive", string>>;
};

/**
 * Names and short descriptions of voices, e.g. "George" / "warm, British".
 * Needs the API key's Voices read permission; a voice it can't read comes back null.
 */
export async function fetchVoiceDetails(apiKey: string, voiceId: string): Promise<VoiceDetails | null> {
  const response = await fetch(`${API}/voices/${encodeURIComponent(voiceId)}`, {
    headers: { "xi-api-key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const voice = (await response.json()) as VoiceResponse;
  const labels = voice.labels ?? {};
  const traits = [labels.descriptive ?? labels.description, labels.accent]
    .filter((t): t is string => !!t)
    .map((t) => t.replace(/_/g, " "));
  return {
    id: voice.voice_id,
    name: voice.name?.split(" - ")[0]?.trim() || voiceId,
    description: traits.length ? traits.join(", ") : null,
  };
}
