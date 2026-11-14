"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { Summary } from "@/core/summary";
import { Info } from "lucide-react";
import { openSignIn, useMe } from "@/lib/me";
import { SummaryCard } from "@/components/summary-card";

type State = { kind: "loading" } | { kind: "ready"; summary: Summary } | { kind: "missing" };

/**
 * An Upload Summary, fetched for its owner: a Member, or the Guest whose
 * browser made it. Anyone else sees "not found".
 */
export function UploadSummary() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const lang = useSearchParams().get("lang") ?? "english";
  const me = useMe();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    // Wait to know who's asking, so a Member's sign-in has settled first.
    if (!me) return;
    let cancelled = false;
    fetch(`/api/uploads/${encodeURIComponent(uploadId)}?lang=${encodeURIComponent(lang)}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ summary: Summary }>) : null))
      .then((found) => !cancelled && setState(found ? { kind: "ready", summary: found.summary } : { kind: "missing" }))
      .catch(() => !cancelled && setState({ kind: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [me, uploadId, lang]);

  if (!me || state.kind === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading your Upload"
        className="h-96 animate-pulse rounded-2xl border border-white/10 bg-white/4"
      />
    );
  }
  if (state.kind === "missing") {
    return (
      <Panel title="No Upload here">
        {me.member ? (
          <p>This Upload doesn&apos;t exist, or it isn&apos;t yours.</p>
        ) : (
          <>
            <p>
              This Upload doesn&apos;t exist, isn&apos;t yours, or was made in another browser. Uploaded
              it while signed in? Sign in to see it.
            </p>
            <button
              type="button"
              onClick={openSignIn}
              className="mt-5 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
            >
              Sign in
            </button>
          </>
        )}
        <Link href="/" className="mt-5 block text-sm text-lumen underline underline-offset-2">
          Back to TLDWatch
        </Link>
      </Panel>
    );
  }
  return (
    <>
      <h1 className="sr-only">Your Upload</h1>
      {!me.member && (
        <p className="mb-4 flex gap-2.5 rounded-xl border border-white/10 bg-white/4 p-3.5 text-pretty text-sm leading-relaxed text-haze">
          <Info className="mt-0.5 size-4 shrink-0 text-lumen" aria-hidden />
          <span>
            This summary is tied to this browser. Keep this page&apos;s link to come back to it.
            Clearing your browser data loses it, and it&apos;s deleted after 30 days. Signing in later
            won&apos;t move it.
          </span>
        </p>
      )}
      <SummaryCard initial={state.summary} />
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-6 text-center text-pretty text-sm leading-relaxed text-haze">
      <h1 className="mb-2 font-heading text-xl font-semibold text-mist">{title}</h1>
      {children}
    </div>
  );
}
