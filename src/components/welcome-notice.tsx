"use client";

import Link from "next/link";
import { useMe } from "@/lib/me";
import { usePreference, writePreference } from "@/lib/preferences";

/**
 * A Guest's first visit: TLDWatch is for adults, and videos go to third-party
 * AI services. Shown once per browser; Members already agreed at sign-up.
 */
export function WelcomeNotice() {
  // The server renders it as seen, so it never flashes before the browser knows.
  const dismissed = usePreference("welcome-notice", "seen") === "seen";
  const me = useMe();
  if (dismissed || !me || me.member) return null;

  const dismiss = () => writePreference("welcome-notice", "seen");

  return (
    <div
      role="region"
      aria-label="Welcome notice"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#151a3c]/95 p-4 text-sm text-mist shadow-[0_16px_48px_-16px_rgb(0_0_0/0.8)] backdrop-blur sm:inset-x-6 sm:bottom-6"
    >
      <p className="text-pretty leading-relaxed">
        TLDWatch is for people <strong>18 and over</strong>. Whatever you summarize is processed by
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
