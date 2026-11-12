"use client";

import * as React from "react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Headphones, Paperclip } from "lucide-react";
import type { SummaryRejection, SummaryResult } from "@/core/core";
import type { Summary } from "@/core/summary";
import { parseVideoUrl } from "@/core/video-url";
import { cn } from "@/lib/utils";

// Adapted from the 21st.dev "ai-chat-input" by preetsuthar17, reshaped for TLDWatch.

const PLACEHOLDERS = [
  "Paste a YouTube link",
  "That 2-hour podcast everyone quotes",
  "A lecture you'll never finish",
  "youtube.com/watch?v=…",
  "A tutorial with 9 minutes of intro",
];

const LENGTHS = ["Short", "Medium", "Detailed"] as const;
type Length = (typeof LENGTHS)[number];

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "original", label: "Original language" },
] as const;
type Language = (typeof LANGUAGES)[number]["value"];

type Notice =
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | { kind: "summarizing"; videoId: string }
  | { kind: "summary"; summary: Summary };

const AUTOPLAY_KEY = "tldwatch:autoplay";

// Autoplay narration is a per-browser setting for Guests, kept in localStorage.
const autoplayListeners = new Set<() => void>();

function subscribeAutoplay(listener: () => void) {
  autoplayListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    autoplayListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readAutoplay(): boolean {
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) === "on";
  } catch {
    return false;
  }
}

function writeAutoplay(on: boolean) {
  try {
    window.localStorage.setItem(AUTOPLAY_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked (private mode etc.): the setting just won't persist.
  }
  autoplayListeners.forEach((listener) => listener());
}

function rejectionText(reason: SummaryRejection): string {
  switch (reason) {
    case "empty":
      return "Paste a YouTube link first.";
    case "not-a-url":
      return "That isn't a link. Paste a YouTube video link, like youtube.com/watch?v=…";
    case "not-youtube":
      return "TLDWatch reads YouTube links only. Saved a clip from TikTok or Instagram? Upload the video file instead.";
    case "no-video-id":
      return "That YouTube link doesn't point to a single video. Open the video and copy its link.";
    case "summary-failed":
      return "Something went wrong while summarizing this video. Please try again in a moment.";
  }
}

async function fetchSummary(videoUrl: string): Promise<SummaryResult> {
  try {
    const response = await fetch("/api/summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl }),
    });
    return (await response.json()) as SummaryResult;
  } catch {
    return { status: "rejected", reason: "summary-failed" };
  }
}

export function SummarizeInput() {
  const reduceMotion = useReducedMotion();
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [value, setValue] = useState("");
  const [length, setLength] = useState<Length>("Medium");
  const [language, setLanguage] = useState<Language>("english");
  const autoplay = useSyncExternalStore(subscribeAutoplay, readAutoplay, () => false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const wrapperRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noticeId = useId();
  // Only the latest submission may update the notice.
  const latestRequest = useRef(0);

  const expanded = isActive || value.length > 0;

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
      setNotice({ kind: "error", text: rejectionText(parsed.reason) });
      return;
    }
    const request = ++latestRequest.current;
    setNotice({ kind: "summarizing", videoId: parsed.videoId });
    const result = await fetchSummary(value);
    if (request !== latestRequest.current) return;
    setNotice(
      result.status === "ready"
        ? { kind: "summary", summary: result.summary }
        : { kind: "error", text: rejectionText(result.reason) },
    );
  };

  const toggleAutoplay = () => writeAutoplay(!autoplay);

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
            <Segmented
              label="Summary length"
              options={LENGTHS.map((l) => ({ value: l, label: l }))}
              value={length}
              onChange={(v) => setLength(v as Length)}
            />
            <Segmented
              label="Summary language"
              options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
              value={language}
              onChange={(v) => setLanguage(v as Language)}
            />
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
                <SummaryView summary={notice.summary} length={length} language={language} />
              ) : (
                <p
                  className={cn(
                    "text-pretty text-sm leading-relaxed",
                    notice.kind === "error" ? "text-[#ffb4a8]" : "text-haze",
                  )}
                >
                  {notice.text}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-white/6 p-1">
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              onChange(option.value);
            }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "h-7 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lumen",
              checked ? "bg-mist text-ink" : "text-haze hover:text-mist",
            )}
          >
            {option.label}
          </button>
        );
      })}
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

function Thumbnail({ videoId }: { videoId: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static YouTube thumbnail, no optimisation needed
    <img
      src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
      alt=""
      width={112}
      height={63}
      className="aspect-video w-28 shrink-0 rounded-lg object-cover"
    />
  );
}

function Summarizing({ videoId }: { videoId: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/4 p-3">
      <Thumbnail videoId={videoId} />
      <p className="text-pretty text-sm leading-relaxed text-haze">
        <span className="font-medium text-mist">Video found.</span> Summarizing it now. A new
        video can take up to a minute.
      </p>
    </div>
  );
}

function SummaryView({
  summary,
  length,
  language,
}: {
  summary: Summary;
  length: Length;
  language: Language;
}) {
  const content = summary.lengths[length.toLowerCase() as Lowercase<Length>];
  return (
    <article className="rounded-2xl border border-white/10 bg-white/4 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <Thumbnail videoId={summary.videoId} />
        <h2 className="font-heading text-lg font-semibold tracking-tight text-mist">
          {length} summary
        </h2>
      </div>
      {language === "original" && (
        <p className="mt-3 text-pretty text-sm text-haze">
          Original-language summaries are coming soon. Here it is in English.
        </p>
      )}
      <p className="mt-4 text-pretty text-base leading-relaxed text-mist">{content.overview}</p>
      <h3 className="mt-5 text-sm font-semibold tracking-wide text-haze uppercase">Key points</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-pretty text-sm leading-relaxed text-mist/90 marker:text-lumen">
        {content.keyPoints.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
    </article>
  );
}
