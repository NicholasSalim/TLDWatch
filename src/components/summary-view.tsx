"use client";

import { useEffect, useState } from "react";
import { Check, ThumbsDown, ThumbsUp, X, type LucideIcon } from "lucide-react";
import {
  LENGTH_LABELS,
  LENGTHS,
  type Length,
  type LengthContent,
  type Summary,
} from "@/core/summary";
import { formatTimestamp, timestampUrl } from "@/core/timestamps";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/segmented";

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

export function SummaryView({
  summary,
  length,
  onLengthChange,
  originalRequested,
}: {
  summary: Summary;
  length: Length;
  onLengthChange: (length: Length) => void;
  originalRequested: boolean;
}) {
  // Every Length arrives with the Summary, so switching is local and instant.
  const content = summary.lengths[length];

  return (
    <article className="rounded-2xl border border-white/10 bg-white/4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-4">
          <Thumbnail videoId={summary.videoId} />
          <h2 className="font-heading text-lg font-semibold tracking-tight text-mist">Summary</h2>
        </div>
        <Segmented
          label="Summary length"
          options={LENGTHS.map((l) => ({ value: l, label: LENGTH_LABELS[l] }))}
          value={length}
          onChange={(v) => onLengthChange(v as Length)}
        />
      </div>

      {originalRequested && (
        <p className="mt-3 text-pretty text-sm text-haze">
          Original-language summaries are coming soon. Here it is in English.
        </p>
      )}

      <Verdict verdict={content.verdict} />

      <p className="mt-5 text-pretty text-base leading-relaxed text-mist">{content.overview}</p>

      <h3 className="mt-6 text-xs font-semibold tracking-widest text-haze uppercase">Key points</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-pretty text-sm leading-relaxed text-mist/90 marker:text-lumen">
        {content.keyPoints.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>

      {content.timestamps.length > 0 && (
        <>
          <h3 className="mt-6 text-xs font-semibold tracking-widest text-haze uppercase">
            Timestamps
          </h3>
          <ol className="mt-2 space-y-0.5">
            {content.timestamps.map((t) => (
              <li key={`${t.seconds}-${t.label}`}>
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
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}

function Verdict({ verdict }: { verdict: LengthContent["verdict"] }) {
  return (
    <section
      aria-label="Verdict"
      className="mt-5 rounded-xl border border-lumen/25 bg-lumen/6 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap gap-2">
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
