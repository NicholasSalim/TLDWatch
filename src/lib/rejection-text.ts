import type { SummaryRejection } from "@/core/core";

/** What to tell someone when a Summary can't be made, in plain words. */
export function rejectionText(rejection: SummaryRejection): string {
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
    case "language-members-only":
      return "Reading a summary in other languages is for Members. Sign in to choose one.";
    case "language-not-offered":
      return "That language isn't offered. Try English or the video's original language.";
    case "pdf-too-long":
      return `That PDF is over ${rejection.limitPages.toLocaleString()} pages, the most TLDWatch can read. Try a shorter part of it.`;
    case "text-too-long":
      return `That text is too long. TLDWatch summarizes up to ${rejection.limitCharacters.toLocaleString()} characters; try a shorter part.`;
    case "upload-not-supported":
      return "That file isn't one TLDWatch can summarize. Try a video, audio file, PDF or image.";
    case "upload-not-found":
      return "That upload couldn't be found. Please upload the file again.";
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
