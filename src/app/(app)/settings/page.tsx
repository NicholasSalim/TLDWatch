import { SettingsPanel } from "@/components/settings-panel";

export const metadata = { title: "Settings · TLDWatch" };

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-24 sm:px-8">
      <h1 className="mb-6 font-heading text-2xl font-semibold tracking-tight text-mist">Settings</h1>
      <SettingsPanel />
    </main>
  );
}
