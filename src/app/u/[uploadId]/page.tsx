import { Suspense } from "react";
import { AccountMenu } from "@/components/account-menu";
import { UploadSummary } from "@/components/upload-summary";
import { Wordmark } from "@/components/wordmark";

export const metadata = {
  title: "Your Upload · TLDWatch",
  // Private to its owner: never in search results.
  robots: { index: false },
};

/** An Upload Summary. It loads in the browser, for its owner only. */
export default function UploadSummaryPage() {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
        <Wordmark />
        <AccountMenu />
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-10 pb-24 sm:px-8">
        {/* Its params and query are only known per request. */}
        <Suspense>
          <UploadSummary />
        </Suspense>
      </main>
    </div>
  );
}
