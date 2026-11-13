import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export const metadata = {
  title: "Not available in your region · TLDWatch",
  robots: { index: false },
};

/** Shown to visitors from regions TLDWatch can't serve (see src/proxy.ts). */
export default function UnavailablePage() {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 pt-6 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-16 text-center sm:px-8">
        <h1 className="font-heading text-2xl font-semibold text-mist">
          TLDWatch isn&apos;t available in your region
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-haze">
          The AI service TLDWatch uses to summarize videos can&apos;t be used from the European
          Union, the EEA, the United Kingdom or Switzerland on the plan we use. We&apos;re sorry
          we can&apos;t serve you there.
        </p>
        <p className="mt-6 text-sm text-haze">
          <Link href="/privacy" className="underline underline-offset-2 hover:text-mist">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-mist">
            Terms
          </Link>
        </p>
      </main>
    </div>
  );
}
