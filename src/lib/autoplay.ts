"use client";

import { useSyncExternalStore } from "react";
import { updateMember, useMe } from "@/lib/me";
import { readPreference, writePreference } from "@/lib/preferences";

/**
 * The "Autoplay Narration" setting. Off by default. A Member's setting is
 * saved to their account; a Guest's lives in this browser's localStorage.
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

const readLocal = () => readPreference("autoplay") === "on";

function writeLocal(on: boolean) {
  writePreference("autoplay", on ? "on" : "off");
  listeners.forEach((listener) => listener());
}

function saveToAccount(on: boolean) {
  updateMember({ autoplay: on });
  fetch("/api/me/autoplay", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    })
    .catch(() => updateMember({ autoplay: !on })); // Not saved: show the truth again.
}

const ignore = () => {};

/**
 * [setting, change]. Off until it's known whether this is a Member, so a
 * Member's account setting is never overridden by this browser's.
 */
export function useAutoplay(): [boolean, (on: boolean) => void] {
  const local = useSyncExternalStore(subscribe, readLocal, () => false);
  const me = useMe();
  if (!me) return [false, ignore];
  return me.member ? [me.member.autoplay, saveToAccount] : [local, writeLocal];
}
