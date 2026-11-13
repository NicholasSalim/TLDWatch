import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Members are 18 or older · TLDWatch" };

/** Where sign-in ends up if someone new skipped the 18+ confirmation. */
export default function AdultRequiredPage() {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center px-5 pt-6 sm:px-8">
        <Wordmark />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-16 text-center sm:px-8">
        <h1 className="font-heading text-2xl font-semibold text-mist">Members are 18 or older</h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-haze">
          To become a Member, confirm you&apos;re 18 or older when you sign in. You haven&apos;t been
          signed up, and you can keep using TLDWatch as a Guest.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink transition-colors hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          Back to TLDWatch
        </Link>
      </main>
    </div>
  );
}
