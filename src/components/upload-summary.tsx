"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { Summary } from "@/core/summary";
import { openSignIn, useMe } from "@/lib/me";
import { SummaryCard } from "@/components/summary-card";

type State = { kind: "loading" } | { kind: "ready"; summary: Summary } | { kind: "missing" };

/** An Upload Summary, fetched for its owner. Anyone else sees "not found". */
export function UploadSummary() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const lang = useSearchParams().get("lang") ?? "english";
  const me = useMe();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!me?.member) return;
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
  }, [me?.member, uploadId, lang]);

  if (me && !me.member) {
    return (
      <Panel title="Sign in to see this Upload">
        <p>Upload Summaries are private to the Member who uploaded the video.</p>
        <button
          type="button"
          onClick={openSignIn}
          className="mt-5 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          Sign in
        </button>
      </Panel>
    );
  }
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
        <p>This Upload doesn&apos;t exist, or it isn&apos;t yours.</p>
        <Link href="/" className="mt-5 inline-block text-sm text-lumen underline underline-offset-2">
          Back to TLDWatch
        </Link>
      </Panel>
    );
  }
  return (
    <>
      <h1 className="sr-only">Your Upload</h1>
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
