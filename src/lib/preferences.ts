"use client";

import { useSyncExternalStore } from "react";

/**
 * Small per-browser preferences (the chosen voice per language, the speed,
 * autoplay, the sidebar, the welcome notice), kept in localStorage. Where
 * storage is blocked they still hold for the page, just not across visits.
 */

const listeners = new Set<() => void>();
const thisPage = new Map<string, string>();

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(`tldwatch:${key}`);
  } catch {
    // Storage blocked: fall back to this page's copy.
    return thisPage.get(key) ?? null;
  }
}

export function writePreference(key: string, value: string) {
  thisPage.set(key, value);
  try {
    window.localStorage.setItem(`tldwatch:${key}`, value);
  } catch {
    // Storage blocked: the preference just won't outlive the page.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Changes made in another tab arrive as storage events.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * A preference as live state: every component reading `key` re-renders when
 * it changes, in this tab or another. `serverValue` is what the server
 * renders, before the browser's own value is known.
 */
export function usePreference(key: string, serverValue: string | null = null) {
  return useSyncExternalStore(subscribe, () => readPreference(key), () => serverValue);
}
