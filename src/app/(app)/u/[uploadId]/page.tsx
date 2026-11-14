import { Suspense } from "react";
import { UploadSummary } from "@/components/upload-summary";

export const metadata = {
  title: "Your Upload · TLDWatch",
  // Private to its owner: never in search results.
  robots: { index: false },
};

/** An Upload Summary. It loads in the browser, for its owner only. */
export default function UploadSummaryPage() {
  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-10 pb-24 sm:px-8">
        {/* Its params and query are only known per request. */}
        <Suspense>
          <UploadSummary />
        </Suspense>
      </main>
    </>
  );
}
