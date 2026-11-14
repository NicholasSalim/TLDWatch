import Link from "next/link";
import { Contact, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms · TLDWatch" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="14 November 2026">
      <p>
        By using TLDWatch you agree to these terms. If you don&apos;t, please don&apos;t use it.
      </p>

      <h2>Who can use it</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>
          TLDWatch isn&apos;t available in the European Union, the EEA, the United Kingdom or
          Switzerland.
        </li>
      </ul>

      <h2>What TLDWatch does</h2>
      <ul>
        <li>
          It summarizes public YouTube videos, and the videos, audio files, PDFs, images and texts
          you upload or paste, using third-party AI services. Their inputs may be reviewed by people
          at those services.
        </li>
        <li>
          Summaries, Verdicts and translations are made by AI. They can be wrong or incomplete, and
          they aren&apos;t professional advice of any kind. Go to the original when it matters.
        </li>
        <li>
          Daily limits apply, and TLDWatch may refuse new Summaries when it has reached its daily
          capacity. Limits and features may change.
        </li>
      </ul>

      <h2>YouTube</h2>
      <p>
        TLDWatch uses the YouTube API Services. By using TLDWatch you also agree to the{" "}
        <a href="https://www.youtube.com/t/terms" rel="noopener noreferrer" target="_blank">
          YouTube Terms of Service
        </a>
        . Videos belong to their creators; TLDWatch links to them and doesn&apos;t copy them.
      </p>

      <h2>Your uploads</h2>
      <ul>
        <li>
          Only upload or paste content you have the right to share with a third-party AI service.
        </li>
        <li>Don&apos;t upload or paste anything private, personal or illegal.</li>
        <li>
          A Guest&apos;s Upload Summaries live only in their browser and are deleted after 30 days;
          keep a copy of anything you need.
        </li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>
          Don&apos;t use bots, scripts or other automated means, or try to get around limits.
          TLDWatch may block access that looks like abuse.
        </li>
        <li>Don&apos;t try to read other people&apos;s private Summaries or break the service.</li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        TLDWatch is provided as it is, without warranties. It may be unavailable, change, or stop at
        any time, and isn&apos;t liable for losses from using it, as far as the law allows.
      </p>

      <h2>Your data</h2>
      <p>
        How TLDWatch handles your data is described in the{" "}
        <Link href="/privacy">Privacy</Link> page. You can delete your account at any time.
      </p>

      <h2>Changes</h2>
      <p>These terms may be updated; the date at the top shows when they last changed.</p>

      <Contact />
    </LegalPage>
  );
}
