"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { HistoryItem } from "@/core/core";
import { sharePath } from "@/core/share";
import { openSignIn, useMe } from "@/lib/me";

type State =
  | { kind: "loading" }
  | { kind: "ready"; items: HistoryItem[]; more: boolean }
  | { kind: "failed" };

/** The server sends this many at a time; a full page means there may be more. */
const PAGE = 50;

async function fetchHistory(before?: string): Promise<HistoryItem[]> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const response = await fetch(`/api/history${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as HistoryItem[];
}

/** A Member's History: every Summary they've opened, newest first. */
export function HistoryList() {
  const me = useMe();
  const isMember = !!me?.member;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!isMember) return;
    let cancelled = false;
    fetchHistory()
      .then(
        (items) =>
          !cancelled &&
          setState({ kind: "ready", items, more: items.length >= PAGE }),
      )
      .catch(() => !cancelled && setState({ kind: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [isMember]);

  const [loadingOlder, setLoadingOlder] = useState(false);

  const showOlder = async () => {
    if (state.kind !== "ready" || state.items.length === 0) return;
    setLoadingOlder(true);
    try {
      const older = await fetchHistory(state.items.at(-1)!.openedAt);
      setState((s) =>
        s.kind === "ready"
          ? {
              kind: "ready",
              items: [...s.items, ...older],
              more: older.length >= PAGE,
            }
          : s,
      );
    } catch {
      // Leave the button there to try again.
    } finally {
      setLoadingOlder(false);
    }
  };

  const remove = async (videoId: string) => {
    if (state.kind !== "ready") return;
    const previous = state;
    setState({
      ...state,
      items: state.items.filter((i) => i.videoId !== videoId),
    });
    const response = await fetch(
      `/api/history?videoId=${encodeURIComponent(videoId)}`,
      {
        method: "DELETE",
      },
    ).catch(() => null);
    if (!response?.ok) setState(previous); // Not removed: put it back.
  };

  if (!me) return <Skeleton />;

  if (!me.member) {
    return (
      <Panel>
        <p className="text-pretty text-sm leading-relaxed text-haze">
          Members get a History of every summary they open. Sign in to keep
          yours.
        </p>
        <button
          type="button"
          onClick={openSignIn}
          className="mt-4 inline-flex h-10 items-center rounded-full bg-lumen px-5 text-sm font-medium text-ink transition-colors hover:bg-[#f8d488] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          Become a Member
        </button>
      </Panel>
    );
  }

  if (state.kind === "loading") return <Skeleton />;
  if (state.kind === "failed") {
    return (
      <Panel>
        <p className="text-sm text-haze">
          Couldn&apos;t load your History. Please try again in a moment.
        </p>
      </Panel>
    );
  }
  if (state.items.length === 0) {
    return (
      <Panel>
        <p className="text-sm text-haze">
          Nothing here yet. Summaries you open will appear here.
        </p>
      </Panel>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {state.items.map((item) => (
          <li
            key={item.videoId}
            className="group relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/4 p-3 transition-colors hover:bg-white/6"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static YouTube thumbnail */}
            <img
              src={`https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`}
              alt=""
              width={112}
              height={63}
              className="aspect-video w-24 shrink-0 rounded-lg object-cover sm:w-28"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={sharePath(item.videoId, item.language)}
                className="line-clamp-2 text-pretty text-sm leading-snug text-mist after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
              >
                {item.preview}
              </Link>
              <p className="mt-1 text-xs text-haze">
                Opened {timeAgo(item.openedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(item.videoId)}
              aria-label="Remove from History"
              className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-haze transition-colors hover:bg-white/10 hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {state.more && (
        <button
          type="button"
          onClick={showOlder}
          disabled={loadingOlder}
          className="mx-auto mt-4 flex h-10 items-center rounded-full bg-white/8 px-5 text-sm font-medium text-mist transition-colors hover:bg-white/14 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
        >
          {loadingOlder ? "Loading…" : "Show older"}
        </button>
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (seconds < 60) return "just now";
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86400)
    return format.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 86400 * 30)
    return format.format(-Math.floor(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-6 text-center">
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="Loading your History" className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[88px] animate-pulse rounded-2xl border border-white/10 bg-white/4"
        />
      ))}
    </div>
  );
}
