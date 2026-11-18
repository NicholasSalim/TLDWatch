"use client";

import { updateMember, useMe } from "@/lib/me";
import { usePreference, writePreference } from "@/lib/preferences";
import { postJson } from "@/lib/json-fetch";

/**
 * The "Autoplay Narration" setting. Off by default. A Member's setting is
 * saved to their account; a Guest's lives in this browser's localStorage.
 */

const writeLocal = (on: boolean) => writePreference("autoplay", on ? "on" : "off");

function saveToAccount(on: boolean) {
  updateMember({ autoplay: on });
  void postJson<{ autoplay: boolean } | null>("/api/me/autoplay", { on }, null, "PUT").then((saved) => {
    if (!saved) updateMember({ autoplay: !on }); // Not saved: show the truth again.
  });
}

const ignore = () => {};

/**
 * [setting, change]. Off until it's known whether this is a Member, so a
 * Member's account setting is never overridden by this browser's.
 */
export function useAutoplay(): [boolean, (on: boolean) => void] {
  const local = usePreference("autoplay") === "on";
  const me = useMe();
  if (!me) return [false, ignore];
  return me.member ? [me.member.autoplay, saveToAccount] : [local, writeLocal];
}
