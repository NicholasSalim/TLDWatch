import { Contact, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy · TLDWatch" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="14 November 2026">
      <p>
        TLDWatch turns YouTube videos, and the files and texts you give it, into Summaries you can
        read or listen to. This page says what TLDWatch processes, who else handles it, and how long
        it&apos;s kept.
      </p>

      <h2>Summaries of YouTube videos</h2>
      <ul>
        <li>
          When you paste a YouTube link, the video is read by a third-party AI service to write its
          Summary. Its inputs may be reviewed by people at that service.
        </li>
        <li>
          A Summary of a YouTube video is shared: anyone who asks for the same video, or opens its
          link, sees the same Summary. It isn&apos;t tied to you.
        </li>
        <li>
          Translations into other languages are made by a third-party AI service from the Summary&apos;s
          text.
        </li>
        <li>
          Video details such as length and privacy come from the YouTube API Services. YouTube&apos;s
          use of data is covered by the{" "}
          <a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank">
            Google Privacy Policy
          </a>
          .
        </li>
      </ul>

      <h2>Uploads: your files and texts</h2>
      <ul>
        <li>
          You can upload a video, an audio file, a PDF or an image, or paste a long text (a text file
          is read in your browser and sent the same way). Members and Guests alike can do this.
        </li>
        <li>
          It&apos;s processed by a third-party AI service to write its Summary, and may be reviewed by
          people there, so don&apos;t upload or paste anything private or personal.
        </li>
        <li>
          An uploaded file is stored privately only while it&apos;s summarized, then deleted from our
          storage and from the AI service, whether summarizing worked or not. A file that&apos;s never
          summarized is deleted within about a day. A pasted text isn&apos;t stored at all; only its
          Summary is.
        </li>
        <li>
          An Upload&apos;s Summary (and any translation of it) is private: only whoever made it can
          open it, and it&apos;s never shared.
        </li>
        <li>
          A Member&apos;s Upload Summaries appear in their History and are deleted with their account.
        </li>
        <li>
          A Guest&apos;s Upload Summaries are tied to the anonymous cookie in their browser, and are
          deleted automatically 30 days after they&apos;re made. Clearing your browser&apos;s cookies
          means you can no longer open them, but they&apos;re still deleted on schedule.
        </li>
      </ul>

      <h2>Guests</h2>
      <ul>
        <li>
          To keep daily limits fair, TLDWatch sets an anonymous cookie (a random ID, lasting a
          year) and keeps a keyed hash of your IP address, never the address itself. They&apos;re
          used only to count new Summaries per day, and those counts are deleted after about two
          months.
        </li>
        <li>
          The cookie also marks your Upload Summaries as yours, so only your browser can open them
          (see Uploads).
        </li>
      </ul>

      <h2>Members</h2>
      <ul>
        <li>
          You sign in with Google. TLDWatch receives your name, email address and profile picture from
          Google, and records when you confirmed you&apos;re 18 or older.
        </li>
        <li>
          TLDWatch keeps your History (the Summaries you&apos;ve opened), your autoplay setting, and
          counts of your new Summaries per day.
        </li>
        <li>
          You can remove History entries at any time, and delete your account in Settings.
          Deleting it removes your profile, settings, History, Uploads and their Summaries, daily
          counts, and your sign-in.
        </li>
        <li>
          You can also remove TLDWatch&apos;s access to your Google account at any time in your{" "}
          <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer" target="_blank">
            Google account settings
          </a>
          .
        </li>
      </ul>

      <h2>Listening</h2>
      <ul>
        <li>The Standard voice runs on your own device; nothing is sent anywhere.</li>
        <li>
          The Natural voice sends the Summary&apos;s text to{" "}
          <a href="https://elevenlabs.io" rel="noopener noreferrer" target="_blank">
            ElevenLabs
          </a>{" "}
          to be spoken. The audio of a YouTube Summary is stored and shared like the Summary itself.
          Upload Summaries never use it; they&apos;re only read in the Standard voice.
        </li>
      </ul>

      <h2>Services that host and run TLDWatch</h2>
      <ul>
        <li>Vercel hosts the site. It sees your IP address and country, which TLDWatch uses to block regions it can&apos;t serve and to keep out bots.</li>
        <li>
          Supabase stores the database (Summaries, Members, History) and uploaded files while
          they&apos;re summarized.
        </li>
        <li>Google provides sign-in for Members.</li>
      </ul>

      <h2>Cookies and storage in your browser</h2>
      <ul>
        <li>The Guest cookie, and sign-in cookies for Members.</li>
        <li>
          Your browser also remembers settings such as autoplay, playback speed, your chosen voices
          and whether you&apos;ve seen the welcome notice. These stay on your device.
        </li>
      </ul>

      <h2>Who TLDWatch is for</h2>
      <p>
        TLDWatch is for people 18 and over, and isn&apos;t available in the European Union, the EEA,
        the United Kingdom or Switzerland.
      </p>

      <Contact />
    </LegalPage>
  );
}
