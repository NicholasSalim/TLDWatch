"use client";

import { useEffect, useRef, useState } from "react";
import type { NarrationStatus } from "@/lib/use-narration";

// A silent, empty WAV: played inside the click, it unlocks audio for later.
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/** Plays a Natural voice MP3 with the same controls as the Standard voice. */
export function useNaturalAudio() {
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const element = () => {
    if (!audio.current) {
      const a = new Audio();
      a.preload = "auto";
      a.onended = () => setStatus("idle");
      // Follow pauses and plays from outside: headphones unplugged, media keys.
      a.onpause = () => setStatus((s) => (a.ended || s === "idle" ? "idle" : "paused"));
      a.onplay = () => setStatus((s) => (s === "idle" && a.src === SILENCE ? s : "speaking"));
      a.onerror = () => {
        setStatus("idle");
        setNotice("The Natural voice audio couldn't play. Press Listen to try again.");
      };
      audio.current = a;
    }
    return audio.current;
  };

  const play = async (a: HTMLAudioElement) => {
    setStatus("speaking");
    setNotice(null);
    try {
      await a.play();
    } catch (error) {
      setStatus("idle");
      setNotice(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Your browser didn't let Narration start on its own. Press Listen to start."
          : "The Natural voice audio couldn't play. Press Listen to try again.",
      );
    }
  };

  /**
   * Call synchronously inside the click, before any await: browsers (Safari
   * especially) only let audio start from a user gesture, and the real audio
   * may take seconds to arrive.
   */
  const prime = () => {
    const a = element();
    if (a.src) return;
    a.src = SILENCE;
    a.play().catch(() => {});
  };

  const start = (url: string, rate: number) => {
    const a = element();
    if (a.src !== url) a.src = url;
    a.currentTime = 0;
    a.playbackRate = rate;
    void play(a);
  };

  const pause = () => {
    audio.current?.pause();
    setStatus("paused");
  };

  const resume = () => {
    if (audio.current) void play(audio.current);
  };

  const stop = () => {
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
    setStatus("idle");
  };

  const changeSpeed = (rate: number) => {
    if (audio.current) audio.current.playbackRate = rate;
  };

  // Silence it when the Summary goes away or switches Length or language.
  useEffect(
    () => () => {
      const a = audio.current;
      if (a) {
        a.pause();
        a.removeAttribute("src"); // Stop downloading too.
        a.load();
      }
      audio.current = null;
      setStatus("idle");
    },
    [],
  );

  return { status, notice, prime, start, pause, resume, stop, changeSpeed };
}
