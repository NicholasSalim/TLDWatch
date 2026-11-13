import { Contact, LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy · TLDWatch" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="13 November 2026">
      <p>
        TLDWatch turns YouTube videos, and videos Members upload, into Summaries you can read or
        listen to. This page says what TLDWatch processes, who else handles it, and how long it&apos;s
        kept.
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

      <h2>Uploads (Members)</h2>
      <ul>
        <li>
          An uploaded video is stored privately only while it&apos;s summarized, then deleted from our
          storage and from the AI service, whether summarizing worked or not. A file that&apos;s never
          summarized is deleted within about a day.
        </li>
        <li>
          The video is processed by a third-party AI service and may be reviewed by people there, so
          don&apos;t upload anything private or personal.
        </li>
        <li>An Upload&apos;s Summary is visible only to you, and is deleted with your account.</li>
      </ul>

      <h2>Guests</h2>
      <ul>
        <li>
          To keep daily limits fair, TLDWatch sets an anonymous cookie (a random ID, lasting a
          year) and keeps a keyed hash of your IP address, never the address itself. They&apos;re
          used only to count new Summaries per day, and those counts are deleted after about two
          months.
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
          You can remove History entries at any time, and delete your account from the menu under
          your name. Deleting it removes your profile, settings, History, Uploads and their
          Summaries, daily counts, and your sign-in.
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
          Uploads never use it.
        </li>
      </ul>

      <h2>Services that host and run TLDWatch</h2>
      <ul>
        <li>Vercel hosts the site. It sees your IP address and country, which TLDWatch uses to block regions it can&apos;t serve and to keep out bots.</li>
        <li>Supabase stores the database (Summaries, Members, History) and files.</li>
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
