"use client";

import { LogOut } from "lucide-react";
import { openSignIn, useMe } from "@/lib/me";

/** Top-right of every page: "Sign in" for a Guest, the Member's menu once signed in. */
export function AccountMenu() {
  const me = useMe();

  // Hold the space while loading, so the header doesn't jump.
  if (!me) return <div className="h-9 w-20" aria-hidden />;

  if (!me.member) {
    return (
      <button
        type="button"
        onClick={openSignIn}
        className="h-9 rounded-full bg-white/8 px-4 text-sm font-medium text-mist transition-colors hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
      >
        Sign in
      </button>
    );
  }

  const { name, email, avatarUrl } = me.member;
  const label = name ?? email ?? "Member";
  return (
    <details className="relative">
      <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full bg-white/8 py-1 pr-3 pl-1 text-sm font-medium text-mist transition-colors hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen [&::-webkit-details-marker]:hidden">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small Google avatar
          <img src={avatarUrl} alt="" width={28} height={28} referrerPolicy="no-referrer" className="size-7 rounded-full" />
        ) : (
          <span aria-hidden className="grid size-7 place-items-center rounded-full bg-lumen text-ink">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-[10rem] truncate">{label}</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-white/10 bg-[#151a3c] p-2 shadow-[0_16px_48px_-16px_rgb(0_0_0/0.8)]">
        {email && <p className="truncate px-2 py-1.5 text-xs text-haze">{email}</p>}
        <form method="post" action="/auth/sign-out">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-mist hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-lumen"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
