"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useMe } from "@/lib/me";
import { readPreference, writePreference } from "@/lib/preferences";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
// Remembered here too, so "Got it" works even where storage is blocked.
let dismissedThisPage = false;
const seen = () => dismissedThisPage || readPreference("welcome-notice") === "seen";

/**
 * A Guest's first visit: TLDWatch is for adults, and videos go to third-party
 * AI services. Shown once per browser; Members already agreed at sign-up.
 */
export function WelcomeNotice() {
  const dismissed = useSyncExternalStore(subscribe, seen, () => true);
  const me = useMe();
  if (dismissed || !me || me.member) return null;

  const dismiss = () => {
    dismissedThisPage = true;
    writePreference("welcome-notice", "seen");
    listeners.forEach((listener) => listener());
  };

  return (
    <div
      role="region"
      aria-label="Welcome notice"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#151a3c]/95 p-4 text-sm text-mist shadow-[0_16px_48px_-16px_rgb(0_0_0/0.8)] backdrop-blur sm:inset-x-6 sm:bottom-6"
    >
      <p className="text-pretty leading-relaxed">
        TLDWatch is for people <strong>18 and over</strong>. Videos you summarize are processed by
        third-party AI services and may be reviewed by people there. See the{" "}
        <Link href="/terms" className="text-lumen underline underline-offset-2">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-lumen underline underline-offset-2">
          Privacy
        </Link>
        .
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="h-9 rounded-full bg-lumen px-4 font-medium text-ink hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
