"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";
import {
  readPreference,
  speechSupported,
  useVoices,
  voicesFor,
  writePreference,
} from "@/lib/speech";
import { useNarration } from "@/lib/use-narration";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

const PRIMARY =
  "inline-flex h-10 items-center gap-2 rounded-full bg-lumen px-4 font-medium text-ink transition-colors hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen";
const SELECT =
  "h-9 rounded-lg border border-white/10 bg-[#151a3c] px-2 text-mist focus-visible:outline-2 focus-visible:outline-lumen";

const noop = () => () => {};

/**
 * Narration in the Standard voice for the Length and language on screen.
 * Remount it, with a `key`, when they change: that stops it.
 */
export function NarrationPlayer({
  chunks,
  languageCode,
  languageName,
  autoStart,
  onAutoStart,
}: {
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
  const device = useVoices();
  const voices = voicesFor(device.voices, languageCode);
  const base = languageCode.split("-")[0];

  // Read only after mount (the player renders nothing before), so no hydration mismatch.
  const [voiceUri, setVoiceUri] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readPreference(`voice:${base}`),
  );
  const [rate, setRate] = useState<number>(() => {
    const saved = typeof window === "undefined" ? null : Number(readPreference("rate"));
    return saved && SPEEDS.includes(saved) ? saved : 1;
  });
  const voice =
    voices.find((v) => v.voiceURI === voiceUri) ?? voices.find((v) => v.default) ?? voices[0];

  const narration = useNarration({ chunks, languageCode, voice, rate });

  const changeRate = (speed: number) => {
    setRate(speed);
    writePreference("rate", String(speed));
    narration.changeSpeed(speed);
  };

  const changeVoice = (uri: string) => {
    setVoiceUri(uri);
    writePreference(`voice:${base}`, uri);
    if (narration.status !== "idle") narration.stop();
  };

  // Autoplay: start once, as soon as the Summary appears and a voice is ready.
  // The flag is set only when the start really happens, so React's dev-mode
  // double effect can't swallow it.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current || !voice) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      onAutoStart();
      narration.start();
    }, 0);
    return () => clearTimeout(timer);
    // narration.start changes every render; this should run when a voice first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, voice]);

  // Until mounted, and until the device's voices load, say nothing rather than
  // flash a wrong "can't read aloud" message.
  if (!mounted) return null;
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

  const { status } = narration;

  return (
    <div lang="en" className="mt-4 rounded-xl border border-white/10 bg-white/3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "idle" ? (
          <button type="button" onClick={narration.start} className={PRIMARY}>
            <Headphones className="size-4" aria-hidden />
            Listen
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={status === "speaking" ? narration.pause : narration.resume}
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
              onClick={narration.stop}
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

      {voices.length > 1 && (
        <label className="mt-2 flex items-center gap-1.5 text-sm text-haze">
          Voice
          <select
            value={voice?.voiceURI}
            onChange={(e) => changeVoice(e.target.value)}
            className={`${SELECT} min-w-0 flex-1`}
          >
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {narration.notice && (
        <p role="status" className="mt-2 text-sm text-haze">
          {narration.notice}
        </p>
      )}
    </div>
  );
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
