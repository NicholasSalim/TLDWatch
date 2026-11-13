"use client";

import { useEffect, useState } from "react";
import { Check, Film, Link2, ThumbsDown, ThumbsUp, X, type LucideIcon } from "lucide-react";
import {
  isEnglish,
  LENGTH_LABELS,
  textLanguageOf,
  LENGTHS,
  type Length,
  type LengthContent,
  type Summary,
  type SummaryLanguage,
} from "@/core/summary";
import { sharePath } from "@/core/share";
import { isUploadId } from "@/core/upload-id";
import { namesOf, type LanguageNames } from "@/lib/language-names";
import { formatTimestamp, timestampUrl } from "@/core/timestamps";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/segmented";

function Thumbnail({ videoId }: { videoId: string }) {
  // An Upload has no thumbnail online: a quiet placeholder instead.
  if (isUploadId(videoId)) {
    return (
      <div
        aria-hidden
        className="grid aspect-video w-28 shrink-0 place-items-center rounded-lg bg-white/8 text-haze"
      >
        <Film className="size-6" />
      </div>
    );
  }
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

// There's no real progress signal from reading a video, so the copy moves
// through the stages on a timer and never claims to be done.
const STAGES = [
  { after: 0, text: "Reading the video…" },
  { after: 8, text: "Picking out the key points…" },
  { after: 18, text: "Marking the moments worth jumping to…" },
  { after: 28, text: "Deciding whether it's worth your time…" },
  { after: 45, text: "Longer videos take a little more time. Nearly there…" },
];

export function Summarizing({ videoId }: { videoId: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage = STAGES.findLast((s) => seconds >= s.after) ?? STAGES[0];

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/4 p-3">
      <Thumbnail videoId={videoId} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-mist">Video found. Summarizing it now.</p>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-haze">{stage.text}</p>
        <div
          role="progressbar"
          aria-label="Summarizing the video"
          aria-valuetext={stage.text}
          className="mt-3 h-1 overflow-hidden rounded-full bg-white/8"
        >
          <div className="progress-sweep h-full w-1/3 rounded-full bg-lumen/80" />
        </div>
      </div>
    </div>
  );
}

/** The language switch on a Summary: English, or the language the video is spoken in. */
/** Why the language chosen isn't showing. */
export type LanguageProblem = "failed" | "members-only" | "not-offered";

/**
 * The language switch on a Summary: English, the video's original language,
 * and (for Members) other configured languages.
 */
export type LanguageControl = {
  value: SummaryLanguage;
  onChange: (language: SummaryLanguage) => void;
  status: "idle" | "translating";
  problem: LanguageProblem | null;
  /** Other languages on offer, labelled for the list. */
  others: { code: string; label: string }[];
  /** Who can pick them: Members; Guests see them greyed out; unknown while loading. */
  othersAccess: "members" | "guests" | "unknown";
  /** The language chosen, named in English, for notes. */
  languageName: string;
};

const PROBLEM_NOTES: Record<LanguageProblem, (name: string) => string> = {
  failed: (name) => `Couldn't make the ${name} version right now. This is the English one.`,
  "members-only": (name) => `Reading in ${name} is for Members. This is the English one.`,
  "not-offered": (name) => `${name} isn't offered any more. This is the English one.`,
};

export function SummaryView({
  summary,
  length,
  onLengthChange,
  languageControl,
  languageNames,
  narration,
}: {
  summary: Summary;
  length: Length;
  onLengthChange: (length: Length) => void;
  languageControl: LanguageControl;
  languageNames?: LanguageNames;
  /** The Narration player for what's on screen. */
  narration?: React.ReactNode;
}) {
  // Every Length arrives with the Summary, so switching is local and instant.
  const content = summary.lengths[length];
  const spoken = summary.spokenLanguage;
  const names = languageNames ?? namesOf(spoken);

  return (
    <article
      lang={textLanguageOf(summary)}
      className="rounded-2xl border border-white/10 bg-white/4 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-4">
          <Thumbnail videoId={summary.videoId} />
          <div className="flex flex-col items-start gap-1">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-mist">Summary</h2>
            {/* An Upload Summary is private: no share link to leak it. */}
            {summary.ownerId ? (
              <p className="text-sm text-haze">Private to you</p>
            ) : (
              <CopyLinkButton videoId={summary.videoId} language={summary.language} />
            )}
          </div>
        </div>
        <Segmented
          label="Summary length"
          options={LENGTHS.map((l) => ({ value: l, label: LENGTH_LABELS[l] }))}
          value={length}
          onChange={(v) => onLengthChange(v as Length)}
        />
      </div>

      <div lang="en" className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm text-haze">Spoken in {names.english}</p>
        {!isEnglish(spoken) && (
          <Segmented
            label="Summary language"
            options={[
              { value: "english", label: "English" },
              { value: "original", label: names.native },
            ]}
            value={languageControl.value}
            onChange={(v) => languageControl.onChange(v as SummaryLanguage)}
          />
        )}
        {languageControl.others.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-haze">
            <span className="sr-only">More languages</span>
            <select
              value={
                languageControl.others.some((o) => o.code === languageControl.value)
                  ? languageControl.value
                  : ""
              }
              onChange={(e) => e.target.value && languageControl.onChange(e.target.value)}
              disabled={languageControl.othersAccess !== "members"}
              className="h-9 rounded-full border border-white/10 bg-[#151a3c] px-3 text-sm text-mist disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-lumen"
            >
              <option value="">
                {languageControl.othersAccess === "guests"
                  ? "More languages · Members only"
                  : "More languages…"}
              </option>
              {languageControl.others.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {languageControl.status === "translating" && (
          <p role="status" className="text-sm text-haze">
            Translating…
          </p>
        )}
        {languageControl.problem && (
          <p role="status" className="text-sm text-negative">
            {PROBLEM_NOTES[languageControl.problem](languageControl.languageName)}
          </p>
        )}
      </div>

      {narration}

      <Verdict verdict={content.verdict} />

      <p className="mt-5 text-pretty text-base leading-relaxed text-mist">{content.overview}</p>

      <h3 lang="en" className="mt-6 text-xs font-semibold tracking-widest text-haze uppercase">Key points</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-pretty text-sm leading-relaxed text-mist/90 marker:text-lumen">
        {content.keyPoints.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>

      {content.timestamps.length > 0 && (
        <>
          <h3 lang="en" className="mt-6 text-xs font-semibold tracking-widest text-haze uppercase">
            Timestamps
          </h3>
          <ol className="mt-2 space-y-0.5">
            {content.timestamps.map((t) => (
              <li key={`${t.seconds}-${t.label}`}>
                {summary.ownerId ? (
                  // No online video to jump to: plain times.
                  <p className="-mx-2 flex items-baseline gap-3 px-2 py-1.5 text-sm">
                    <span className="shrink-0 font-medium text-lumen tabular-nums">
                      {formatTimestamp(t.seconds)}
                    </span>
                    <span className="text-pretty text-mist/90">{t.label}</span>
                  </p>
                ) : (
                <a
                  href={timestampUrl(summary.videoId, t.seconds)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group -mx-2 flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/6 focus-visible:outline-2 focus-visible:outline-lumen"
                >
                  <span className="shrink-0 font-medium text-lumen tabular-nums">
                    {formatTimestamp(t.seconds)}
                  </span>
                  <span className="text-pretty text-mist/90 group-hover:text-mist">{t.label}</span>
                  <span className="sr-only"> (opens YouTube at this moment)</span>
                </a>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}

function CopyLinkButton({ videoId, language }: { videoId: string; language: SummaryLanguage }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [link, setLink] = useState("");

  useEffect(() => {
    if (state !== "copied") return;
    const reset = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(reset);
  }, [state]);

  const copy = async () => {
    const url = new URL(sharePath(videoId, language), window.location.origin).href;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  // Clipboard blocked: show the link itself, so it can be copied by hand.
  if (state === "failed") {
    return (
      <a href={link} className="text-sm break-all text-haze underline underline-offset-2">
        {link}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-haze transition-colors hover:text-mist focus-visible:outline-2 focus-visible:outline-lumen"
    >
      {state === "copied" ? (
        <Check className="size-4 text-positive" aria-hidden />
      ) : (
        <Link2 className="size-4" aria-hidden />
      )}
      <span aria-live="polite">
        {state === "copied" ? "Link copied" : "Copy link"}
      </span>
    </button>
  );
}

function Verdict({ verdict }: { verdict: LengthContent["verdict"] }) {
  return (
    <section
      aria-label="Verdict"
      className="mt-5 rounded-xl border border-lumen/25 bg-lumen/6 p-3.5 sm:p-4"
    >
      <div lang="en" className="flex flex-wrap gap-2">
        <VerdictBadge
          good={verdict.worthWatching}
          icon={verdict.worthWatching ? ThumbsUp : ThumbsDown}
          text={verdict.worthWatching ? "Worth watching in full" : "The Summary is enough"}
        />
        <VerdictBadge
          good={verdict.deliversOnTitle}
          icon={verdict.deliversOnTitle ? Check : X}
          text={verdict.deliversOnTitle ? "Delivers on its title" : "Doesn't deliver on its title"}
        />
      </div>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-mist/90">{verdict.explanation}</p>
    </section>
  );
}

function VerdictBadge({
  good,
  icon: Icon,
  text,
}: {
  good: boolean;
  icon: LucideIcon;
  text: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        good ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}
