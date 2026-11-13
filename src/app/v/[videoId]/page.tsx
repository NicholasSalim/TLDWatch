import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SummaryCard } from "@/components/summary-card";
import { namesOf } from "@/lib/language-names";
import { AccountMenu } from "@/components/account-menu";
import { Wordmark } from "@/components/wordmark";
import { isVideoId } from "@/core/video-url";
import { getCore } from "@/server/core";

export async function generateMetadata({
  params,
}: PageProps<"/v/[videoId]">): Promise<Metadata> {
  const { videoId } = await params;
  const valid = isVideoId(videoId);
  return {
    title: "A video summary · TLDWatch",
    description: "Read the summary, key points and verdict, or listen to it, instead of watching.",
    openGraph: valid ? { images: [`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`] } : undefined,
    // A malformed link can never hold a Summary; keep it out of search results.
    robots: valid ? undefined : { index: false },
  };
}

/**
 * A Summary opened from its share link. Anyone can read it, and opening it
 * makes nothing. Switching to the original language may translate it once.
 */
export default function SharedSummaryPage({ params, searchParams }: PageProps<"/v/[videoId]">) {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
        <Wordmark />
        <AccountMenu />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-10 pb-24 sm:px-8">
        <Suspense fallback={<LoadingSummary />}>
          <SummaryFromLink params={params} searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function SummaryFromLink({
  params,
  searchParams,
}: Pick<PageProps<"/v/[videoId]">, "params" | "searchParams">) {
  const { videoId } = await params;
  const { lang } = await searchParams;
  const language = lang === "original" ? "original" : "english";
  // An original-language link still opens if only the English Summary exists.
  const summary =
    (await getCore().readSharedSummary(videoId, language)) ??
    (language === "original" ? await getCore().readSharedSummary(videoId) : null);
  if (!summary) return <NoSummary />;
  return (
    <>
      <h1 className="sr-only">Video summary</h1>
      <SummaryCard initial={summary} languageNames={namesOf(summary.spokenLanguage)} recordOpen />
    </>
  );
}

function LoadingSummary() {
  return (
    <div
      role="status"
      aria-label="Loading the summary"
      className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/4"
    />
  );
}

function NoSummary() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-6 text-center">
      <h1 className="font-heading text-xl font-semibold text-mist">No summary here yet</h1>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-haze">
        This link doesn&apos;t point to a summary. Paste the YouTube link on the home page to make
        one.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink transition-colors hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
      >
        Summarize a video
      </Link>
    </div>
  );
}
