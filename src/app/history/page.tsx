import { AccountMenu } from "@/components/account-menu";
import { HistoryList } from "@/components/history-list";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "History · TLDWatch" };

/** A Member's History. The list itself loads in the browser, for the signed-in Member. */
export default function HistoryPage() {
  return (
    <div className="backdrop relative isolate flex min-h-dvh flex-col overflow-hidden">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
        <Wordmark />
        <AccountMenu />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-24 sm:px-8">
        <h1 className="mb-6 font-heading text-2xl font-semibold tracking-tight text-mist">History</h1>
        <HistoryList />
      </main>
    </div>
  );
}
