"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * The sign-in dialog, mounted once for the whole site and opened with
 * `openSignIn()`. Signing in is a plain form post to /auth/sign-in, which
 * hands over to Google. New Members must confirm they're 18 or older.
 */
export function SignInDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [adult, setAdult] = useState(false);
  const [next, setNext] = useState("/");
  const checkboxId = useId();

  useEffect(() => {
    const open = () => {
      setNext(window.location.pathname + window.location.search);
      dialog.current?.showModal();
    };
    window.addEventListener("tldwatch:sign-in", open);
    return () => window.removeEventListener("tldwatch:sign-in", open);
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${checkboxId}-title`}
      onClick={(e) => {
        // A click on the backdrop (the dialog itself, not its content) closes it.
        if (e.target === dialog.current) dialog.current.close();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#151a3c] p-0 text-mist shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)] backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
    >
      <form method="post" action="/auth/sign-in" className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${checkboxId}-title`} className="font-heading text-xl font-semibold">
            Become a Member
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="-mt-1 -mr-2 grid size-9 place-items-center rounded-full text-haze hover:bg-white/8 hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-haze">
          Sign in with Google for 10 new summaries a day and videos up to 30 minutes long.
        </p>

        <label
          htmlFor={checkboxId}
          className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/4 p-3 text-sm"
        >
          <input
            id={checkboxId}
            type="checkbox"
            name="adult"
            required
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            className="mt-0.5 size-4 accent-[#f5c66b]"
          />
          <span>I&apos;m 18 or older.</span>
        </label>

        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          disabled={!adult}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-mist font-medium text-ink transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          <GoogleMark />
          Continue with Google
        </button>
        <p className="mt-3 text-pretty text-xs leading-relaxed text-haze/80">
          Videos are summarized by a third-party AI service. Returning Members can tick the box
          again; it&apos;s only recorded once.
        </p>
      </form>
    </dialog>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}
