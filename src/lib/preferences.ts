"use client";

/** Small per-browser preferences: the chosen voice per language, and the speed. */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(`tldwatch:${key}`);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(`tldwatch:${key}`, value);
  } catch {
    // Storage blocked: the preference just won't persist.
  }
}
