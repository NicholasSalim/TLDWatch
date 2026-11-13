"use client";

import { useSyncExternalStore } from "react";
import type { Me } from "@/lib/api-types";

/**
 * Who's signed in, fetched once per page and shared by every component.
 * `null` until it loads; then `{ member: null }` for a Guest.
 */
let me: Me | null = null;
let loading = false;
const listeners = new Set<() => void>();

function load() {
  if (loading || me) return;
  loading = true;
  fetch("/api/me", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<Me>;
    })
    .then((result) => {
      me = result;
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // Unknown, not a Guest: try again on the next subscriber or in a moment.
      setTimeout(() => listeners.size > 0 && load(), 5000);
    })
    .finally(() => {
      loading = false;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

export function useMe(): Me | null {
  return useSyncExternalStore(
    subscribe,
    () => me,
    () => null,
  );
}

/** Updates the signed-in Member's settings here, after saving them on the server. */
export function updateMember(changes: Partial<NonNullable<Me["member"]>>) {
  if (!me?.member) return;
  me = { member: { ...me.member, ...changes } };
  listeners.forEach((listener) => listener());
}

/** Opens the sign-in dialog from anywhere on the page. */
export function openSignIn() {
  window.dispatchEvent(new Event("tldwatch:sign-in"));
}
