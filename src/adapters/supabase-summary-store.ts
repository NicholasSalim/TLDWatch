/**
 * Store adapter: Summaries live in the Supabase Postgres `summaries` table
 * (see supabase/migrations). Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SummaryStore } from "@/core/ports";
import type { Summary } from "@/core/summary";

type SummaryRow = {
  video_id: string;
  language: Summary["language"];
  spoken_language: string;
  lengths: Summary["lengths"];
  created_at: string;
};

const COLUMNS = "video_id, language, spoken_language, lengths, created_at";

const fromRow = (row: SummaryRow): Summary => ({
  videoId: row.video_id,
  language: row.language,
  spokenLanguage: row.spoken_language,
  lengths: row.lengths,
  createdAt: row.created_at,
});

export function createSupabaseSummaryStore({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): SummaryStore {
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function findSummary(videoId: string, language: Summary["language"]) {
    const { data, error } = await db
      .from("summaries")
      .select(COLUMNS)
      .eq("video_id", videoId)
      .eq("language", language)
      .maybeSingle<SummaryRow>();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }

  return {
    findSummary,

    async saveSummary(summary) {
      // Another server instance may have stored this video first: keep theirs.
      const { error } = await db.from("summaries").upsert(
        {
          video_id: summary.videoId,
          language: summary.language,
          spoken_language: summary.spokenLanguage,
          lengths: summary.lengths,
          created_at: summary.createdAt,
        },
        { onConflict: "video_id,language", ignoreDuplicates: true },
      );
      if (error) throw error;
      const stored = await findSummary(summary.videoId, summary.language);
      if (!stored) throw new Error(`Summary for ${summary.videoId} vanished after saving`);
      return stored;
    },
  };
}
