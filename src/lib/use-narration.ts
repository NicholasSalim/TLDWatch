"use client";

import { useEffect, useRef, useState } from "react";

export type NarrationStatus = "idle" | "speaking" | "paused";

const BLOCKED =
  "Your browser didn't let Narration start on its own. Press Listen to start.";
const FAILED = "Narration stopped unexpectedly. Press Listen to try again.";

/**
 * Plays chunks of text in the Standard voice, one after another.
 *
 * Works around the Web Speech API's rough edges:
 * - Pause is a stop that remembers the chunk, and Resume replays that chunk.
 *   The browser's own pause() is unreliable (a no-op on Android Chrome, and
 *   it leaves Chrome and Safari stuck if cancel() follows it).
 * - The current utterance is kept in a ref: Chrome can otherwise garbage-
 *   collect it and never fire its `end` event.
 * - A watchdog catches speech that silently never starts (iOS without a tap).
 */
export function useNarration({
  chunks,
  languageCode,
  voice,
  rate,
}: {
  chunks: string[];
  languageCode: string;
  voice: SpeechSynthesisVoice | undefined;
  rate: number;
}) {
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);

  // Each start gets a new session; callbacks from an older one are ignored.
  const session = useRef(0);
  const position = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // What the next chunk is read with; kept current for callbacks already queued.
  const settings = useRef({ chunks, languageCode, voice, rate });
  useEffect(() => {
    settings.current = { chunks, languageCode, voice, rate };
  });

  /** Silences everything now, whatever state the browser is in. */
  const halt = () => {
    session.current++;
    clearTimeout(watchdog.current);
    utterance.current = null;
    const synth = window.speechSynthesis;
    synth.resume(); // cancel() while paused leaves Chrome and Safari stuck.
    synth.cancel();
  };

  const speakFrom = (index: number) => {
    halt();
    const id = session.current;
    setStatus("speaking");
    setNotice(null);

    const fail = (message: string) => {
      if (id !== session.current) return;
      halt();
      setStatus("idle");
      setNotice(message);
    };

    const next = (i: number) => {
      if (id !== session.current) return;
      const { chunks, languageCode, voice, rate } = settings.current;
      if (i >= chunks.length) {
        utterance.current = null;
        position.current = 0;
        setStatus("idle");
        return;
      }
      position.current = i;
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.lang = voice?.lang ?? languageCode;
      if (voice) u.voice = voice;
      u.rate = rate;
      u.onstart = () => clearTimeout(watchdog.current);
      u.onend = () => next(i + 1);
      u.onerror = (event) => {
        if (event.error === "interrupted" || event.error === "canceled") return;
        fail(event.error === "not-allowed" ? BLOCKED : FAILED);
      };
      utterance.current = u;
      window.speechSynthesis.speak(u);

      clearTimeout(watchdog.current);
      watchdog.current = setTimeout(() => {
        if (id === session.current && !window.speechSynthesis.speaking) fail(BLOCKED);
      }, 4000);
    };

    next(index);
  };

  const start = () => speakFrom(0);

  const pause = () => {
    halt();
    setStatus("paused");
  };

  const resume = () => speakFrom(position.current);

  const stop = () => {
    halt();
    position.current = 0;
    setStatus("idle");
  };

  /** Speed applies per chunk, so replay the current chunk at the new speed. */
  const changeSpeed = (newRate: number) => {
    settings.current = { ...settings.current, rate: newRate };
    if (status === "speaking") speakFrom(position.current);
  };

  // Stop when the Summary goes away, is hidden, or switches Length or language.
  useEffect(
    () => () => {
      session.current++;
      clearTimeout(watchdog.current);
      window.speechSynthesis?.resume();
      window.speechSynthesis?.cancel();
      setStatus("idle");
    },
    [],
  );

  return { status, notice, start, pause, resume, stop, changeSpeed };
}
