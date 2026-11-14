# TLDWatch

Paste a YouTube link and get a summary you can read or listen to, instead of watching the video. It also summarizes long pasted text and uploaded files: video, audio, PDFs and images.

Live at [tldwatch.vercel.app](https://tldwatch.vercel.app).

## What it does

- Each summary comes in three lengths, with key points, timestamps (or page references for PDFs) and a verdict on whether the original is worth your time.
- Summaries can be read in English, in the video's own language, or (for signed-in users) in a few other languages.
- Summaries can be read aloud, by the device's own voices or by ElevenLabs voices for signed-in users.
- YouTube summaries are shared: one link per video. Summaries of uploads and pasted text are private to whoever made them.
- Anyone can use it without an account, within a daily limit. Signing in with Google raises the limit and adds a history.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind), deployed on **Vercel**
- **Supabase** for Postgres, file storage and Google sign-in
- **Gemini** reads the videos, files and text and writes the summaries
- **YouTube Data API** checks a video's length and availability before it's read
- **ElevenLabs** for the optional AI voices
- **Vitest** for tests

## How it's organised

The business rules live in a framework-free core, and everything external is reached through interfaces the core defines. Tests run against the core with in-memory fakes, so they never call Gemini, Supabase or YouTube.

```
src/
  core/        rules: limits, ownership, languages, file checks (+ tests)
  adapters/    Gemini, Supabase, YouTube and ElevenLabs implementations
  server/      wires the core to the adapters; auth and guest identity
  app/         pages and API routes (thin: request in, core call, response out)
  components/  UI
supabase/migrations/   database schema, applied in order
```

Uploaded files are checked by their contents (not just their name) in the browser and again on the server, stored privately only while they're summarized, then deleted.

## Running it locally

You'll need Node 20.9 or newer, a Supabase project, and API keys for Gemini and the YouTube Data API.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with the variables below.

3. In the Supabase SQL editor, run each file in `supabase/migrations/` in filename order.

4. In Supabase Auth, enable the Google provider and add `http://localhost:3000/auth/callback` (and your deployed URL's `/auth/callback`) to the allowed redirect URLs.

5. Start the dev server:

   ```bash
   npm run dev
   ```

### Environment variables

Required:

| Variable | What it's for |
| --- | --- |
| `GEMINI_API_KEY` | Writing summaries and translations |
| `YOUTUBE_API_KEY` | Checking videos before they're read |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side database and storage access |
| `GUEST_SECRET` | Signs the anonymous guest cookie; any long random string |
| `CRON_SECRET` | Protects the daily clean-up job; any long random string |

Optional:

| Variable | Default | What it's for |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | | AI voices for signed-in users |
| `ELEVENLABS_VOICES` | four stock voices | Voice IDs per language, first is the default: `en=<id>,<id>;es=<id>;*=<id>` |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` | |
| `GEMINI_MODEL` | `gemini-3.5-flash` | |
| `SUMMARY_LANGUAGES` | none | Extra summary languages for signed-in users, e.g. `id,es,zh` |
| `CONTACT_EMAIL` | | Shown on the Terms and Privacy pages |
| `GUEST_DAILY_SUMMARIES` | `3` | New summaries per guest per day |
| `GUEST_DAILY_SUMMARIES_PER_IP` | `10` | New summaries per network per day |
| `MEMBER_DAILY_SUMMARIES` | `10` | New summaries per signed-in user per day |
| `DAILY_VIDEO_MINUTES` | `360` | Total minutes of YouTube read per day, across everyone |
| `NATURAL_VOICE_MONTHLY_CHARACTERS` | `8000` | ElevenLabs characters per month, across everyone |
| `UPLOAD_MAX_MB` | `50` | Largest upload; the storage bucket is capped at 50 MB |

## Scripts

```bash
npm run dev        # dev server
npm test           # tests
npm run typecheck  # type check
npm run lint       # lint
npm run build      # production build
```

CI runs the type check, lint and tests on every pull request and every push to `main`.

## Deploying

Deploy to Vercel with the same environment variables. `vercel.json` schedules a daily job at `/api/cron/sweep-uploads`, which deletes abandoned uploads, guests' private summaries after 30 days, and old usage counts. It only runs if `CRON_SECRET` is set.
