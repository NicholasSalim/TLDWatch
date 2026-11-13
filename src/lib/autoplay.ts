"use client";

import { useSyncExternalStore } from "react";
import { readPreference, writePreference } from "@/lib/speech";

/**
 * The "Autoplay Narration" setting. Off by default. A Guest's setting lives
 * in this browser's localStorage, shared by every tab.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const read = () => readPreference("autoplay") === "on";

function write(on: boolean) {
  writePreference("autoplay", on ? "on" : "off");
  listeners.forEach((listener) => listener());
}

export function useAutoplay(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => false), write];
}
