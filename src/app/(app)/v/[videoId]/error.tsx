"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

/** A share link that couldn't load, usually a brief storage hiccup. */
export default function SharedSummaryError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-10 sm:px-8">
      <div className="rounded-2xl border border-white/10 bg-white/4 p-6 text-center">
        <h1 className="font-heading text-xl font-semibold text-mist">
          Couldn&apos;t load this summary
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-haze">
          Something went wrong on our side. The summary is still there, so please try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-5 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink transition-colors hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
