"use client";

import { useSyncExternalStore } from "react";

/**
 * The Standard voice: the device's own speech synthesis. Everything here runs
 * in the browser; nothing is sent anywhere or stored on a server.
 */

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export type DeviceVoices = { voices: SpeechSynthesisVoice[]; ready: boolean };

// getVoices() returns a new array on every call, so keep one snapshot and
// replace it only when something changes. Chrome loads voices late and says
// so with "voiceschanged"; others have them at once.
let snapshot: DeviceVoices = { voices: [], ready: false };
const SERVER: DeviceVoices = { voices: [], ready: false };

function subscribeVoices(listener: () => void) {
  if (!speechSupported()) return () => {};
  const update = (ready: boolean) => {
    const voices = window.speechSynthesis.getVoices();
    const nowReady = snapshot.ready || ready || voices.length > 0;
    const same =
      nowReady === snapshot.ready &&
      voices.map((v) => v.voiceURI).join("|") === snapshot.voices.map((v) => v.voiceURI).join("|");
    if (same) return;
    snapshot = { voices, ready: nowReady };
    listener();
  };
  const onChange = () => update(true);
  update(false);
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  // Some devices never send "voiceschanged" when they have no voices at all.
  const giveUp = setTimeout(() => update(true), 3000);
  return () => {
    clearTimeout(giveUp);
    window.speechSynthesis.removeEventListener("voiceschanged", onChange);
  };
}

/** The device's voices, and whether they've finished loading. */
export function useVoices(): DeviceVoices {
  return useSyncExternalStore(
    subscribeVoices,
    () => snapshot,
    () => SERVER,
  );
}

// Old codes some devices (notably Android) still report.
const LEGACY: Record<string, string> = { iw: "he", in: "id", ji: "yi" };

function baseLanguage(code: string): string {
  const base = code.toLowerCase().replace("_", "-").split("-")[0];
  return LEGACY[base] ?? base;
}

/** The voices that speak a language, matched on its base code ("ko" for "ko-KR"). */
export function voicesFor(all: SpeechSynthesisVoice[], languageCode: string): SpeechSynthesisVoice[] {
  const base = baseLanguage(languageCode);
  return all.filter((v) => baseLanguage(v.lang) === base);
}

/**
 * Call synchronously inside the click, before any await: iOS only lets speech
 * start from a user gesture.
 */
export function primeSpeech() {
  if (!speechSupported()) return;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}
