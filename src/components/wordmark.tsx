import Link from "next/link";
import { cn } from "@/lib/utils";

/** The skip-forward mark: skip the video. Same as the app icon. */
export function SkipMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#f5c66b" />
      <path d="M5.5 7 11.5 12 5.5 17Z M11 7 17 12 11 17Z" fill="#0e1330" />
      <rect x="17.2" y="7" width="1.8" height="10" rx="0.5" fill="#0e1330" />
    </svg>
  );
}

/** The mark and name, linking home. `compact` shows only the mark (a collapsed sidebar). */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label={compact ? "TLDWatch home" : undefined}
      className="flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight text-mist focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lumen"
    >
      <SkipMark />
      {!compact && "TLDWatch"}
    </Link>
  );
}
