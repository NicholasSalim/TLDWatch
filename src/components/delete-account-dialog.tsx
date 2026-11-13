"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

/** Opens the delete-account confirmation from anywhere on the page. */
export function openDeleteAccount() {
  window.dispatchEvent(new Event("tldwatch:delete-account"));
}

/**
 * Deleting a Member's account, after a clear confirmation: what goes, what
 * stays, and a box to tick before the button works.
 */
export function DeleteAccountDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sure, setSure] = useState(false);
  const [state, setState] = useState<"idle" | "deleting" | "failed">("idle");
  const titleId = useId();
  const checkboxId = useId();

  useEffect(() => {
    const open = () => {
      setSure(false);
      setState("idle");
      dialog.current?.showModal();
    };
    window.addEventListener("tldwatch:delete-account", open);
    return () => window.removeEventListener("tldwatch:delete-account", open);
  }, []);

  const remove = async () => {
    setState("deleting");
    const response = await fetch("/api/me/delete", { method: "POST" }).catch(() => null);
    if (!response?.ok) return setState("failed");
    // A fresh start as a Guest: a full reload, not router.push, so nothing of the
    // account (such as the signed-in Member kept in memory) lingers on the page.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  const busy = state === "deleting";

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => !busy && e.target === dialog.current && dialog.current.close()}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#151a3c] p-0 text-mist shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)] backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-semibold">
            Delete your account?
          </h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className="-mt-1 -mr-2 grid size-9 place-items-center rounded-full text-haze hover:bg-white/8 hover:text-mist disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-lumen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-3 space-y-3 text-pretty text-sm leading-relaxed text-haze">
          <p>
            <span className="font-medium text-mist">Deleted for good:</span> your Member profile and
            settings, your History, and your Upload Summaries.
          </p>
          <p>
            <span className="font-medium text-mist">Stays:</span> summaries of YouTube videos, since
            they&apos;re shared with everyone. Links people have shared keep working.
          </p>
        </div>

        <label htmlFor={checkboxId} className="mt-5 flex cursor-pointer items-start gap-3 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            checked={sure}
            disabled={busy}
            onChange={(e) => setSure(e.target.checked)}
            className="mt-0.5 size-4 accent-[#ffb4a8]"
          />
          <span>I understand this can&apos;t be undone.</span>
        </label>

        {state === "failed" && (
          <p role="status" className="mt-4 text-sm text-negative">
            Your account couldn&apos;t be deleted just now. Please try again in a moment.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => dialog.current?.close()}
            className="h-10 rounded-full bg-white/8 px-4 text-sm font-medium text-mist hover:bg-white/14 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
          >
            Keep my account
          </button>
          <button
            type="button"
            disabled={!sure || busy}
            onClick={() => void remove()}
            className="h-10 rounded-full bg-negative px-4 text-sm font-medium text-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
