"use client";

import { LogOut, Trash2 } from "lucide-react";
import { useAutoplay } from "@/lib/autoplay";
import { openSignIn, useMe } from "@/lib/me";
import { cn } from "@/lib/utils";
import { openDeleteAccount } from "@/components/delete-account-dialog";

/** Settings: listening for everyone; the account, and deleting it, for Members. */
export function SettingsPanel() {
  const me = useMe();
  const [autoplay, setAutoplay] = useAutoplay();

  if (!me) {
    return <div role="status" aria-label="Loading settings" className="h-64 animate-pulse rounded-2xl bg-white/4" />;
  }

  return (
    <div className="space-y-6">
      <Section title="Listening">
        <Row
          label="Autoplay Narration"
          hint={
            me.member
              ? "Start reading a Summary aloud as soon as it appears. Saved to your account."
              : "Start reading a Summary aloud as soon as it appears. Saved in this browser."
          }
        >
          <Switch checked={autoplay} onChange={setAutoplay} label="Autoplay Narration" />
        </Row>
        <p className="text-pretty text-sm leading-relaxed text-haze">
          {me.member
            ? "Natural voices are yours as a Member while this month's shared allowance lasts. Pick one in the Voice list under any Summary."
            : "Natural voices, native to each language, are for Members. Your device's voices work for everyone."}
        </p>
      </Section>

      <Section title="Account">
        {me.member ? (
          <>
            <Row label={me.member.name ?? "Member"} hint={me.member.email ?? undefined}>
              <form method="post" action="/auth/sign-out">
                <button
                  type="submit"
                  className="flex h-9 items-center gap-2 rounded-full bg-white/8 px-4 text-sm font-medium text-mist hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
                >
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </form>
            </Row>
            <Row
              label="Delete account"
              hint="Deletes your profile, settings, History and Upload Summaries for good. Shared YouTube Summaries stay."
            >
              <button
                type="button"
                onClick={openDeleteAccount}
                className="flex h-9 items-center gap-2 rounded-full border border-negative/40 px-4 text-sm font-medium text-negative hover:bg-negative/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
              >
                <Trash2 className="size-4" aria-hidden />
                Delete…
              </button>
            </Row>
          </>
        ) : (
          <Row label="You're using TLDWatch as a Guest" hint="Sign in for 10 new Summaries a day, a History and Natural voices.">
            <button
              type="button"
              onClick={openSignIn}
              className="h-9 rounded-full bg-lumen px-4 text-sm font-medium text-ink hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
            >
              Sign in
            </button>
          </Row>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/4 p-5">
      <h2 className="mb-4 font-heading text-lg font-semibold text-mist">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-medium text-mist">{label}</p>
        {hint && <p className="mt-0.5 text-pretty text-sm text-haze">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen",
        checked ? "bg-lumen" : "bg-white/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-1 size-5 rounded-full bg-mist shadow transition-transform",
          checked ? "translate-x-5 bg-ink" : "translate-x-0",
        )}
      />
    </button>
  );
}
