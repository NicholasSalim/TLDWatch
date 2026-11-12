import Link from "next/link";
import { SummarizeInput } from "@/components/summarize-input";

export default function Home() {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 pt-6 sm:px-8">
        <Wordmark />
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 pt-16 pb-24 sm:px-8">
        <h1 className="max-w-[16ch] text-center font-heading text-[clamp(2.6rem,7vw,4.75rem)] leading-[0.95] font-bold tracking-[-0.035em] text-balance text-mist">
          Skip the video. Keep the point.
        </h1>
        <p className="mt-5 max-w-[52ch] text-center text-base leading-relaxed text-balance text-haze sm:text-lg">
          Paste a YouTube link to read the summary, or listen to it, in about a minute.
        </p>

        <div className="mt-12 flex w-full justify-center sm:mt-14">
          <SummarizeInput />
        </div>

        <p className="mt-10 max-w-[52ch] text-center text-sm leading-relaxed text-pretty text-haze/80">
          Every summary comes with key points, clickable timestamps, and a verdict on whether the
          full video is worth your time.
        </p>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-6 text-center text-xs text-haze/70 sm:px-8">
        Works with public YouTube videos. For ages 18 and over.
      </footer>
    </div>
  );
}

function Wordmark() {
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
