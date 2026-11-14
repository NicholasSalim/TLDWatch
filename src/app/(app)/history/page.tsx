import { HistoryList } from "@/components/history-list";

export const metadata = { title: "History · TLDWatch" };

/** A Member's History. The list itself loads in the browser, for the signed-in Member. */
export default function HistoryPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-24 sm:px-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold tracking-tight text-mist">History</h1>
        <HistoryList />
      </main>
    </>
  );
}
