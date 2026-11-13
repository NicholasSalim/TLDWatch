import Link from "next/link";

export function Wordmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 rounded-md font-heading text-lg font-semibold tracking-tight text-mist focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lumen"
    >
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="1.5" y="4" width="21" height="16" rx="5" fill="#f5c66b" />
        <path d="M10 8.6v6.8l5.6-3.4z" fill="#0e1330" />
      </svg>
      TLDWatch
    </Link>
  );
}
