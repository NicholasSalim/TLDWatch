"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, X } from "lucide-react";
import type { UploadStart } from "@/core/core";
import type { SummaryResponse } from "@/lib/api-types";
import { rejectionText } from "@/lib/rejection-text";

type Step =
  | { kind: "choose" }
  | { kind: "uploading"; percent: number }
  | { kind: "summarizing" }
  | { kind: "error"; message: string };

/** Opens the Upload dialog from anywhere on the page (Members only). */
export function openUpload() {
  window.dispatchEvent(new Event("tldwatch:upload"));
}

/**
 * Uploading a video file, for Members: a warning to accept, a file checked in
 * the browser before anything is sent, then a direct upload to private
 * storage and a private Summary. The file is deleted once it's summarized.
 */
export function UploadDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [understood, setUnderstood] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "choose" });
  const titleId = useId();
  const checkboxId = useId();
  const busy = step.kind === "uploading" || step.kind === "summarizing";

  useEffect(() => {
    const open = () => {
      setStep({ kind: "choose" });
      dialog.current?.showModal();
    };
    window.addEventListener("tldwatch:upload", open);
    return () => window.removeEventListener("tldwatch:upload", open);
  }, []);

  const close = () => {
    if (!busy) dialog.current?.close();
  };

  const choose = async (file: File) => {
    setStep({ kind: "uploading", percent: 0 });
    try {
      const durationSeconds = (await videoDuration(file)) ?? 0;
      const start = await postJson<UploadStart>("/api/uploads", {
        sizeBytes: file.size,
        durationSeconds,
        mimeType: file.type || "video/mp4",
      });
      if (start.status !== "ready") return setStep({ kind: "error", message: startRejection(start) });

      await putWithProgress(start.uploadUrl, file, (percent) => setStep({ kind: "uploading", percent }));
      setStep({ kind: "summarizing" });

      const result = await postJson<SummaryResponse>(`/api/uploads/${start.uploadId}`, {});
      if (result.status !== "ready") return setStep({ kind: "error", message: rejectionText(result) });
      dialog.current?.close();
      router.push(`/u/${start.uploadId}`);
    } catch {
      setStep({ kind: "error", message: "The upload didn't go through. Please try again." });
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => e.target === dialog.current && close()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#151a3c] p-0 text-mist shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)] backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-heading text-xl font-semibold">
            Upload a video
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            disabled={busy}
            className="-mt-1 -mr-2 grid size-9 place-items-center rounded-full text-haze hover:bg-white/8 hover:text-mist disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-lumen"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-haze">
          Summarize a clip saved from TikTok, Instagram or your device, up to 30 minutes and 50 MB.
          Its Summary is private to you.
        </p>

        <div className="mt-4 rounded-xl border border-lumen/25 bg-lumen/6 p-3.5 text-pretty text-sm leading-relaxed text-mist/90">
          Your video is sent to a third-party AI service to be summarized, and may be reviewed by
          people there. Don&apos;t upload anything private or personal. The file is deleted once
          it&apos;s summarized.
        </div>

        <label htmlFor={checkboxId} className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            checked={understood}
            disabled={busy}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 size-4 accent-[#f5c66b]"
          />
          <span>I understand.</span>
        </label>

        {step.kind === "uploading" && (
          <Progress label={`Uploading… ${step.percent}%`} percent={step.percent} />
        )}
        {step.kind === "summarizing" && (
          <Progress label="Summarizing your video. This can take a minute or two." />
        )}
        {step.kind === "error" && (
          <p role="status" className="mt-4 text-pretty text-sm text-negative">
            {step.message}
          </p>
        )}

        {!busy && (
          <label
            className={`mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-lumen ${
              understood
                ? "cursor-pointer bg-lumen text-ink hover:bg-[#f8d488]"
                : "cursor-not-allowed bg-white/10 text-haze"
            }`}
          >
            <Upload className="size-4" aria-hidden />
            Choose a video file
            <input
              type="file"
              accept="video/*"
              disabled={!understood}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void choose(file);
              }}
            />
          </label>
        )}
      </div>
    </dialog>
  );
}

function Progress({ label, percent }: { label: string; percent?: number }) {
  return (
    <div className="mt-4">
      <p role="status" className="text-sm text-haze">
        {label}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8"
      >
        {percent === undefined ? (
          <div className="progress-sweep h-full w-1/3 rounded-full bg-lumen/80" />
        ) : (
          <div className="h-full rounded-full bg-lumen/80 transition-[width]" style={{ width: `${percent}%` }} />
        )}
      </div>
    </div>
  );
}

function startRejection(start: Exclude<UploadStart, { status: "ready" }>): string {
  switch (start.reason) {
    case "upload-members-only":
      return "Uploading is for Members. Sign in to upload a video.";
    case "upload-not-a-video":
      return "That file isn't a video. Choose a video file, like an .mp4 or .mov.";
    case "upload-too-large":
      return `That file is over ${start.limitMb} MB, the largest TLDWatch accepts.`;
    case "video-too-long":
      return `That video is over ${start.limitMinutes} minutes, the longest TLDWatch can summarize.`;
    case "daily-limit-reached":
      return rejectionText(start);
  }
}

/** The video's length, read in the browser before uploading; null if it can't tell. */
function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    video.src = url;
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Refusals come back as JSON with a status; anything else is a real failure.
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("status" in data)) throw new Error(`HTTP ${response.status}`);
  return data as T;
}

/** Uploads the file straight to private storage, reporting progress. */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "video/mp4");
    request.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    request.onload = () => (request.status < 300 ? resolve() : reject(new Error(`HTTP ${request.status}`)));
    request.onerror = () => reject(new Error("network"));
    request.send(file);
  });
}
