"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";
import type { NarrationResult, NaturalVoiceAllowance } from "@/core/core";
import type { Length, SummaryLanguage } from "@/core/summary";
import { useMe } from "@/lib/me";
import { primeSpeech, speechSupported, useVoices, voicesFor } from "@/lib/speech";
import { readPreference, writePreference } from "@/lib/preferences";
import { useNarration } from "@/lib/use-narration";
import { useNaturalAudio } from "@/lib/use-natural-audio";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const PRIMARY =
  "inline-flex h-10 items-center gap-2 rounded-full bg-lumen px-4 font-medium text-ink transition-colors hover:bg-[#f8d488] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen";
const SELECT =
  "h-9 rounded-lg border border-white/10 bg-[#151a3c] px-2 text-mist focus-visible:outline-2 focus-visible:outline-lumen";

const noop = () => () => {};

/** Voice list values for Natural voices start with this; every other value is a device voice. */
const NATURAL = "natural:";

type NaturalVoiceOption = { id: string; name: string; description: string | null };

const FALLBACK_NOTES: Record<Exclude<NarrationResult, { voice: "natural" }>["reason"], string | null> = {
  guest: null,
  "no-summary": null,
  "allowance-used-up":
    "This month's Natural voice allowance is used up, so the Standard voice is reading instead.",
  "natural-voice-unavailable":
    "The Natural voice isn't available right now, so the Standard voice is reading instead.",
  // An Upload is private, and Natural voice audio is shared: the Standard voice reads it.
  "upload-not-eligible": null,
};

/** Enough left for a Detailed narration: below this, the allowance is "almost used up". */
const COMFORTABLE_CHARACTERS = 1_500;

/** About the shortest narration: below this, the Natural voice is "used up". */
const MIN_NARRATION_CHARACTERS = 100;

// The Natural voices on offer per language, fetched once per page and shared.
const voicesRequests = new Map<string, Promise<NaturalVoiceOption[]>>();
function loadNaturalVoices(languageCode: string): Promise<NaturalVoiceOption[]> {
  const base = languageCode.toLowerCase().split("-")[0];
  let request = voicesRequests.get(base);
  if (!request) {
    request = fetch(`/api/narration/voices?lang=${encodeURIComponent(base)}`)
      .then((r) => (r.ok ? (r.json() as Promise<NaturalVoiceOption[]>) : []))
      .catch(() => []);
    voicesRequests.set(base, request);
  }
  return request;
}

// The allowance, fetched once per page and shared by every player on it.
let allowanceRequest: Promise<NaturalVoiceAllowance | null> | null = null;
function loadAllowance(): Promise<NaturalVoiceAllowance | null> {
  allowanceRequest ??= fetch("/api/narration/allowance", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<NaturalVoiceAllowance>) : null))
    .catch(() => null);
  return allowanceRequest;
}

/**
 * Narration for the Length and language on screen. The Voice list offers the
 * Natural voice (Members, while the month's allowance lasts; shown greyed out
 * otherwise) alongside the device's Standard voices. Remount it, with a `key`,
 * when the Length or language changes: that stops it.
 */
export function NarrationPlayer({
  videoId,
  language,
  length,
  chunks,
  languageCode,
  languageName,
  autoStart,
  onAutoStart,
}: {
  videoId: string;
  language: SummaryLanguage;
  length: Length;
  chunks: string[];
  /** BCP-47 code of the text being read, e.g. "en" or "ko". */
  languageCode: string;
  /** The language's name in English, for messages. */
  languageName: string;
  autoStart: boolean;
  /** Called when autoplay starts, so it happens once per Summary, not per switch. */
  onAutoStart: () => void;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const me = useMe();
  const isMember = !!me?.member;
  const device = useVoices();
  const voices = voicesFor(device.voices, languageCode);
  const base = languageCode.split("-")[0];

  // Read only after mount (the player renders nothing before), so no hydration mismatch.
  // Either "natural" or a device voice's URI; null until someone chooses.
  const [voiceChoice, setVoiceChoice] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readPreference(`voice:${base}`),
  );
  const [rate, setRate] = useState<number>(() => {
    const saved = typeof window === "undefined" ? null : Number(readPreference("rate"));
    return saved && SPEEDS.includes(saved) ? saved : 1;
  });

  // The device voice to use whenever the Standard voice reads.
  const deviceVoice =
    voices.find((v) => v.voiceURI === voiceChoice) ?? voices.find((v) => v.default) ?? voices[0];

  const speech = useNarration({ chunks, languageCode, voice: deviceVoice, rate });
  const naturalAudio = useNaturalAudio();

  // The Natural voice: Members only, while the month's allowance lasts.
  const [allowance, setAllowance] = useState<NaturalVoiceAllowance | null>(null);
  const [naturalVoices, setNaturalVoices] = useState<NaturalVoiceOption[]>([]);
  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    loadAllowance().then((a) => !cancelled && setAllowance(a));
    loadNaturalVoices(languageCode).then((v) => !cancelled && setNaturalVoices(v));
    return () => {
      cancelled = true;
    };
  }, [isMember, languageCode]);
  const naturalSelectable =
    isMember && !(allowance && allowance.charactersLeft < MIN_NARRATION_CHARACTERS);

  // A Member who hasn't chosen gets the first Natural voice; a choice is remembered.
  const wantsNatural =
    voiceChoice?.startsWith(NATURAL) || voiceChoice === "natural" || (voiceChoice === null && isMember);
  const chosenNatural =
    naturalVoices.find((v) => NATURAL + v.id === voiceChoice) ?? naturalVoices[0] ?? null;
  const [naturalUrl, setNaturalUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const useNatural = wantsNatural && naturalSelectable && fallbackNote === null;
  const active = useNatural ? naturalAudio : speech;

  const listen = async () => {
    if (!useNatural) return speech.start();
    if (naturalUrl) return naturalAudio.start(naturalUrl, rate);
    if (asking) return;

    // Unlock both voices now, inside the click: the answer may take seconds.
    naturalAudio.prime();
    primeSpeech();
    setAsking(true);
    const result = await askForNarration(videoId, language, length, chosenNatural?.id);
    setAsking(false);
    if (result.voice === "natural") {
      setNaturalUrl(result.audioUrl);
      naturalAudio.start(result.audioUrl, rate);
    } else {
      // This time the Standard voice reads; say why.
      setFallbackNote(FALLBACK_NOTES[result.reason] ?? "");
      if (result.reason === "allowance-used-up") {
        setAllowance((a) => (a ? { ...a, charactersLeft: 0 } : a));
      }
      speech.start();
    }
  };

  const changeRate = (speed: number) => {
    setRate(speed);
    writePreference("rate", String(speed));
    active.changeSpeed(speed);
  };

  const changeVoice = (value: string) => {
    speech.stop();
    naturalAudio.stop();
    setFallbackNote(null);
    setNaturalUrl(null); // Each Natural voice has its own audio.
    setVoiceChoice(value);
    writePreference(`voice:${base}`, value);
  };

  // Autoplay: start once, as soon as the Summary appears and it can play.
  // The flag is set only when the start really happens, so React's dev-mode
  // double effect can't swallow it.
  const autoStarted = useRef(false);
  const ready = me !== null && (useNatural || !!deviceVoice);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !ready) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      onAutoStart();
      void listen();
    }, 0);
    return () => clearTimeout(timer);
    // listen changes every render; this should run when playback first becomes possible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, ready]);

  // Until mounted, and until the device's voices load, say nothing rather than
  // flash a wrong "can't read aloud" message.
  if (!mounted || me === null) return null;
  if (!naturalSelectable) {
    if (!speechSupported()) {
      return (
        <Message>
          This browser can&apos;t read a Summary aloud. Try a recent Chrome, Edge or Safari.
        </Message>
      );
    }
    if (voices.length === 0 && !device.ready) return null;
    if (voices.length === 0) {
      return (
        <Message>
          Your device has no voice for {languageName}, so this Summary can&apos;t be read aloud here.
        </Message>
      );
    }
  }

  const { status } = active;
  // When Natural voices can't be chosen, one greyed-out line says why.
  const unavailableLabel = !isMember
    ? "Natural voices · Members only"
    : allowance
      ? `Natural voices · used up until ${monthDay(allowance.resetsAt)}`
      : "Natural voices";
  const almostUsedUp = !!allowance && allowance.charactersLeft < COMFORTABLE_CHARACTERS;
  const notice = active.notice ?? fallbackNote;

  return (
    <div lang="en" className="mt-4 rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" ? (
          <button type="button" onClick={() => void listen()} disabled={asking} className={PRIMARY}>
            <Headphones className="size-4" aria-hidden />
            {asking ? "Getting ready…" : "Listen"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={status === "speaking" ? active.pause : active.resume}
              className={PRIMARY}
            >
              {status === "speaking" ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              {status === "speaking" ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={active.stop}
              aria-label="Stop"
              className="grid size-10 place-items-center rounded-full bg-white/8 text-mist transition-colors hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
            >
              <Square className="size-4" aria-hidden />
            </button>
          </>
        )}

        <label className="ml-auto flex items-center gap-1.5 text-sm text-haze">
          Speed
          <select value={rate} onChange={(e) => changeRate(Number(e.target.value))} className={SELECT}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-2 flex items-center gap-1.5 text-sm text-haze">
        Voice
        <select
          value={
            useNatural && chosenNatural ? NATURAL + chosenNatural.id : (deviceVoice?.voiceURI ?? "")
          }
          onChange={(e) => changeVoice(e.target.value)}
          className={`${SELECT} min-w-0 flex-1`}
        >
          <optgroup label={almostUsedUp ? "Natural voices · almost used up" : "Natural voices"}>
            {naturalSelectable && naturalVoices.length > 0 ? (
              naturalVoices.map((v) => (
                <option key={v.id} value={NATURAL + v.id}>
                  {v.description ? `${v.name} · ${v.description}` : v.name}
                </option>
              ))
            ) : (
              <option value={NATURAL} disabled>
                {unavailableLabel}
              </option>
            )}
          </optgroup>
          {voices.length > 0 && (
            <optgroup label="This device">
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {useNatural && (
        <p className="mt-2 text-xs text-haze">
          {chosenNatural ? `${chosenNatural.name}, a Natural voice` : "Natural voice"} by{" "}
          <a
            href="https://elevenlabs.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-mist"
          >
            elevenlabs.io
          </a>
        </p>
      )}

      {notice && (
        <p role="status" className="mt-2 text-sm text-haze">
          {notice}
        </p>
      )}
    </div>
  );
}

function monthDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "long" });
}

async function askForNarration(
  videoId: string,
  language: SummaryLanguage,
  length: Length,
  naturalVoiceId: string | undefined,
): Promise<NarrationResult> {
  try {
    const response = await fetch("/api/narration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, language, length, naturalVoiceId }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as NarrationResult;
  } catch {
    return { voice: "standard", reason: "natural-voice-unavailable" };
  }
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <p
      lang="en"
      role="status"
      className="mt-4 rounded-xl border border-white/10 bg-white/3 p-3 text-sm text-haze"
    >
      {children}
    </p>
  );
}
