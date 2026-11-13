"use client";

import * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Headphones, Paperclip } from "lucide-react";
import type { SummariesLeft, SummaryRejection } from "@/core/core";
import { LENGTH_LABELS, LENGTHS, type Length, type Summary } from "@/core/summary";
import { parseVideoUrl } from "@/core/video-url";
import { useAutoplay } from "@/lib/autoplay";
import { fetchSummary } from "@/lib/summary-client";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/segmented";
import { SummaryCard } from "@/components/summary-card";
import { Summarizing } from "@/components/summary-view";

// Adapted from the 21st.dev "ai-chat-input" by preetsuthar17, reshaped for TLDWatch.

const PLACEHOLDERS = [
  "Paste a YouTube link",
  "That 2-hour podcast everyone quotes",
  "A lecture you'll never finish",
  "youtube.com/watch?v=…",
  "A tutorial with 9 minutes of intro",
];

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "original", label: "Original language" },
] as const;
type Language = (typeof LANGUAGES)[number]["value"];

type Notice =
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | { kind: "summarizing"; videoId: string }
  | { kind: "summary"; summary: Summary; translationFailed: boolean };

function rejectionText(rejection: SummaryRejection): string {
  switch (rejection.reason) {
    case "empty":
      return "Paste a YouTube link first.";
    case "not-a-url":
      return "That isn't a link. Paste a YouTube video link, like youtube.com/watch?v=…";
    case "not-youtube":
      return "TLDWatch reads YouTube links only. Saved a clip from TikTok or Instagram? Upload the video file instead.";
    case "no-video-id":
      return "That YouTube link doesn't point to a single video. Open the video and copy its link.";
    case "video-unavailable":
      return "TLDWatch can't read this video. It may be private, unlisted, members-only or deleted. Only public videos can be summarized.";
    case "video-not-finished":
      return "This video is live or hasn't premiered yet. Come back once it's over and it can be summarized.";
    case "video-too-long":
      return rejection.memberLimitMinutes
        ? `This video is over ${rejection.limitMinutes} minutes, the limit for Guests. Members can summarize videos up to ${rejection.memberLimitMinutes} minutes.`
        : `This video is over ${rejection.limitMinutes} minutes, the longest TLDWatch can summarize.`;
    case "daily-limit-reached":
      return rejection.memberDailyLimit
        ? `You've used today's new summaries. You can make more ${whenLocal(rejection.resetsAt)}, or sign up as a Member for ${rejection.memberDailyLimit} a day. Summaries that already exist still open.`
        : `You've used today's new summaries. You can make more ${whenLocal(rejection.resetsAt)}.`;
    case "app-capacity-reached":
      return `TLDWatch has read all the videos it can for now. Back ${whenLocal(rejection.resetsAt)}. Summaries that already exist still open.`;
    case "summary-failed":
      return "Something went wrong while summarizing this video. Please try again in a moment.";
  }
}

/**
 * A reset time in the Guest's own time zone: "today at 4:00 PM" west of UTC,
 * "tomorrow at 7:00 AM" east of it.
 */
function whenLocal(iso: string): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === new Date().toDateString();
  return `${sameDay ? "today" : "tomorrow"} at ${time}`;
}

export function SummarizeInput() {
  const reduceMotion = useReducedMotion();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [value, setValue] = useState("");
  const [length, setLength] = useState<Length>("medium");
  const [language, setLanguage] = useState<Language>("english");
  const [autoplay, setAutoplay] = useAutoplay();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [summariesLeft, setSummariesLeft] = useState<SummariesLeft | null>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeId = useId();
  // Only the latest submission may update the notice.
  const latestRequest = useRef(0);

  const expanded = isActive || value.length > 0;

  // How many new Summaries are left today; also gives a first-time Guest their cookie.
  useEffect(() => {
    fetch("/api/summaries-left")
      .then((response) => (response.ok ? response.json() : null))
      .then((left: SummariesLeft | null) => left && setSummariesLeft(left))
      .catch(() => {});
  }, []);

  // Cycle the placeholder while the input is idle.
  useEffect(() => {
    if (expanded) return;
    let swap: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setShowPlaceholder(false);
      swap = setTimeout(() => {
        setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3200);
    return () => {
      clearInterval(interval);
      clearTimeout(swap);
    };
  }, [expanded]);

  // Collapse when focus or a click lands outside an empty input.
  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      if (!inputRef.current?.value) setIsActive(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseVideoUrl(value);
    if (!parsed.ok) {
      setNotice({ kind: "error", text: rejectionText({ status: "rejected", reason: parsed.reason }) });
      return;
    }
    const request = ++latestRequest.current;
    setNotice({ kind: "summarizing", videoId: parsed.videoId });
    const result = await fetchSummary(value, language);
    if (result.summariesLeft) setSummariesLeft(result.summariesLeft);
    if (request !== latestRequest.current) return;
    setNotice(
      result.status === "ready"
        ? { kind: "summary", summary: result.summary, translationFailed: !!result.translationFailed }
        : { kind: "error", text: rejectionText(result) },
    );
  };

  const toggleAutoplay = () => setAutoplay(!autoplay);

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <div className="relative w-full max-w-2xl">
      {/* The projector glow: brightens when the input is in use. */}
      <div
        aria-hidden
        className={cn(
          "glow pointer-events-none absolute -inset-x-24 -inset-y-32 -z-10 sm:-inset-x-40 rounded-full transition-opacity duration-700",
          expanded ? "opacity-100" : "opacity-60",
        )}
      />

      <motion.form
        ref={wrapperRef}
        onSubmit={submit}
        onClick={() => setIsActive(true)}
        noValidate
        className={cn(
          "w-full overflow-hidden rounded-[28px] border bg-[#151a3c]/80 backdrop-blur-xl transition-[border-color,box-shadow] duration-300",
          expanded
            ? "border-lumen/35 shadow-[0_24px_80px_-24px_rgb(245_198_107/0.45)]"
            : "border-white/10 shadow-[0_12px_40px_-20px_rgb(0_0_0/0.6)]",
        )}
      >
        <div className="flex items-center gap-1.5 p-2.5 sm:gap-2 sm:p-3">
          <button
            type="button"
            aria-label="Upload a video file"
            title="Upload a video file"
            onClick={(e) => {
              e.stopPropagation();
              setNotice({
                kind: "info",
                text: "Uploading a video file is for Members. Sign in with Google to upload clips from TikTok, Instagram or your device.",
              });
            }}
            className="grid size-11 shrink-0 place-items-center rounded-full text-haze transition-colors hover:bg-white/8 hover:text-mist focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen"
          >
            <Paperclip className="size-5" aria-hidden />
          </button>

          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="YouTube video link"
              aria-describedby={notice ? noticeId : undefined}
              aria-invalid={notice?.kind === "error" || undefined}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (notice?.kind === "error" || notice?.kind === "info") setNotice(null);
              }}
              onFocus={() => setIsActive(true)}
              className="relative z-10 w-full bg-transparent py-2 text-base text-mist outline-none sm:text-lg"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
              <AnimatePresence mode="wait">
                {showPlaceholder && !value && (
                  <motion.span
                    key={placeholderIndex}
                    aria-hidden
                    className="truncate whitespace-nowrap text-base text-haze/80 select-none sm:text-lg"
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    variants={{
                      animate: { transition: { staggerChildren: reduceMotion ? 0 : 0.02 } },
                      exit: {
                        transition: { staggerChildren: reduceMotion ? 0 : 0.012, staggerDirection: -1 },
                      },
                    }}
                  >
                    {PLACEHOLDERS[placeholderIndex].split("").map((char, i) => (
                      <motion.span
                        key={i}
                        className="inline-block"
                        variants={
                          reduceMotion
                            ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
                            : {
                                initial: { opacity: 0, filter: "blur(10px)", y: 8 },
                                animate: {
                                  opacity: 1,
                                  filter: "blur(0px)",
                                  y: 0,
                                  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
                                },
                                exit: {
                                  opacity: 0,
                                  filter: "blur(10px)",
                                  y: -8,
                                  transition: { duration: 0.2 },
                                },
                              }
                        }
                      >
                        {char === " " ? " " : char}
                      </motion.span>
                    ))}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <button
            type="submit"
            aria-label="Summarize"
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen sm:px-5",
              value
                ? "bg-lumen text-ink hover:bg-[#f8d488]"
                : "bg-white/10 text-haze hover:bg-white/15",
            )}
          >
            <span className="hidden sm:inline">Summarize</span>
            <ArrowUp className="size-5 sm:hidden" aria-hidden />
          </button>
        </div>

        <motion.div
          initial={false}
          animate={expanded ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          transition={spring}
          inert={!expanded}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-3 pt-3 pb-3.5 sm:px-4">
            {/* Once a Summary is showing, its own Length switcher takes over. */}
            {notice?.kind !== "summary" && (
              <Segmented
                label="Summary length"
                options={LENGTHS.map((l) => ({ value: l, label: LENGTH_LABELS[l] }))}
                value={length}
                onChange={(v) => setLength(v as Length)}
              />
            )}
            {notice?.kind !== "summary" && (
              <Segmented
                label="Summary language"
                options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
                value={language}
                onChange={(v) => setLanguage(v as Language)}
              />
            )}
            <button
              type="button"
              aria-pressed={autoplay}
              onClick={(e) => {
                e.stopPropagation();
                toggleAutoplay();
              }}
              className={cn(
                "ml-auto flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lumen",
                autoplay
                  ? "bg-lumen/15 text-lumen ring-1 ring-lumen/50"
                  : "bg-white/6 text-haze hover:bg-white/10 hover:text-mist",
              )}
            >
              <Headphones className="size-4" aria-hidden />
              Autoplay narration
            </button>
          </div>
        </motion.div>
      </motion.form>

      <div id={noticeId} role="status" aria-live="polite" className="min-h-6 px-4 pt-4">
        <AnimatePresence mode="wait">
          {notice && (
            <motion.div
              key={noticeKey(notice)}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {notice.kind === "summarizing" ? (
                <Summarizing videoId={notice.videoId} />
              ) : notice.kind === "summary" ? (
                <SummaryCard
                  initial={notice.summary}
                  initialLength={length}
                  translationFailed={notice.translationFailed}
                />
              ) : (
                <p
                  className={cn(
                    "text-pretty text-sm leading-relaxed",
                    notice.kind === "error" ? "text-negative" : "text-haze",
                  )}
                >
                  {notice.text}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {summariesLeft && (
        <p className="px-4 pt-3 text-xs text-haze/80">
          {summariesLeft.left === 1 ? "1 new summary" : `${summariesLeft.left} new summaries`} left
          today.
        </p>
      )}
    </div>
  );
}

function noticeKey(notice: Notice): string {
  switch (notice.kind) {
    case "summarizing":
      return `summarizing:${notice.videoId}`;
    case "summary":
      return `summary:${notice.summary.videoId}`;
    default:
      return notice.text;
  }
}
