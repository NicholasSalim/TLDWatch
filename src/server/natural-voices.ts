/**
 * The Natural voices on offer, per language, and their names from the
 * ElevenLabs API (cached for a day).
 *
 * ELEVENLABS_VOICES lists voice IDs per language, native speakers ideally,
 * first being the default:
 *   en=<id>,<id>;id=<id>;zh=<id>;es=<id>;*=<id>
 * "*" covers any language not listed (a multilingual voice, with an accent).
 */
import "server-only";
import { fetchVoiceDetails, type VoiceDetails } from "@/adapters/elevenlabs-natural-voice";

/** Ready-made ElevenLabs voices anyone can use, with names in case the API can't be asked. */
const DEFAULT_VOICES: VoiceDetails[] = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "warm, British" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "soft, American" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "casual, Australian" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "upbeat, American" },
];
const DEFAULT_IDS = DEFAULT_VOICES.map((v) => v.id);

/** Voice IDs per base language code ("en", "ko"), plus "*" for any other. */
function voicesByLanguage(): Record<string, string[]> {
  const byLanguage: Record<string, string[]> = {};
  for (const group of (process.env.ELEVENLABS_VOICES ?? "").split(";")) {
    const [language, ids = ""] = group.split("=");
    const list = ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (language?.trim() && list.length) byLanguage[language.trim().toLowerCase()] = list;
  }
  return byLanguage;
}

export function naturalVoiceSettings(): {
  voicesFor: (languageCode: string) => string[];
  model: string;
} {
  const byLanguage = voicesByLanguage();
  return {
    voicesFor: (languageCode) =>
      byLanguage[languageCode.toLowerCase().split("-")[0]] ?? byLanguage["*"] ?? DEFAULT_IDS,
    model: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const details = new Map<string, { at: number; voice: VoiceDetails }>();

async function describe(id: string, position: number): Promise<VoiceDetails> {
  const hit = details.get(id);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.voice;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const fromApi = apiKey ? await fetchVoiceDetails(apiKey, id).catch(() => null) : null;
  const voice = fromApi ??
    DEFAULT_VOICES.find((v) => v.id === id) ?? {
      id,
      name: `Natural voice ${position + 1}`,
      description: null,
    };
  details.set(id, { at: Date.now(), voice });
  return voice;
}

/** The voices on offer for a language, in order, with names: from ElevenLabs if it answers. */
export async function naturalVoiceList(languageCode: string): Promise<VoiceDetails[]> {
  const ids = naturalVoiceSettings().voicesFor(languageCode);
  return Promise.all(ids.map((id, i) => describe(id, i)));
}
