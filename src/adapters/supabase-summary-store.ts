/**
 * Store adapter: Summaries live in the Supabase Postgres `summaries` table
 * (see supabase/migrations). Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SummaryStore } from "@/core/ports";
import { isGuestOwner } from "@/core/requester";
import type { Summary } from "@/core/summary";

type SummaryRow = {
  video_id: string;
  language: Summary["language"];
  spoken_language: string;
  lengths: Summary["lengths"];
  created_at: string;
  owner_id: string | null;
  guest_owner_id: string | null;
  source: NonNullable<Summary["source"]>;
};

const COLUMNS = "video_id, language, spoken_language, lengths, created_at, owner_id, guest_owner_id, source";
const GUEST_PREFIX = "guest-";

const fromRow = (row: SummaryRow): Summary => ({
  videoId: row.video_id,
  language: row.language,
  spokenLanguage: row.spoken_language,
  lengths: row.lengths,
  createdAt: row.created_at,
  // The core knows one owner key; the table keeps Members and Guests apart.
  ...(row.owner_id && { ownerId: row.owner_id }),
  ...(row.guest_owner_id && { ownerId: GUEST_PREFIX + row.guest_owner_id }),
  // A video is the default, and stays implicit.
  ...(row.source !== "video" && { source: row.source }),
});

/** An owner key as the two owner columns. */
function ownerColumns(ownerId: string | undefined) {
  if (!ownerId) return { owner_id: null, guest_owner_id: null };
  return isGuestOwner(ownerId)
    ? { owner_id: null, guest_owner_id: ownerId.slice(GUEST_PREFIX.length) }
    : { owner_id: ownerId, guest_owner_id: null };
}

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

    async findSummaries(videoIds, language) {
      if (videoIds.length === 0) return [];
      const { data, error } = await db
        .from("summaries")
        .select(COLUMNS)
        .in("video_id", videoIds)
        .eq("language", language)
        .returns<SummaryRow[]>();
      if (error) throw error;
      return data.map(fromRow);
    },

    async deleteOwnedBy(ownerId) {
      const { owner_id, guest_owner_id } = ownerColumns(ownerId);
      // No owner means no Uploads to delete; never let it reach the table as a filter.
      if (!owner_id && !guest_owner_id) throw new Error("deleteOwnedBy needs an owner");
      const { error } = owner_id
        ? await db.from("summaries").delete().eq("owner_id", owner_id)
        : await db.from("summaries").delete().eq("guest_owner_id", guest_owner_id as string);
      if (error) throw error;
    },

    async deleteGuestOwnedBefore(cutoff) {
      // Old Guest Uploads, by their English Summary (the first one made)...
      const { data, error } = await db
        .from("summaries")
        .select("video_id")
        .not("guest_owner_id", "is", null)
        .eq("language", "english")
        .lt("created_at", cutoff)
        .limit(1000)
        .returns<{ video_id: string }[]>();
      if (error) throw error;
      const ids = data.map((row) => row.video_id);
      if (ids.length === 0) return 0;
      // ...then every language of each.
      const { error: deleteError } = await db.from("summaries").delete().in("video_id", ids);
      if (deleteError) throw deleteError;
      return ids.length;
    },

    async saveSummary(summary) {
      // Another server instance may have stored this video first: keep theirs.
      const { error } = await db.from("summaries").upsert(
        {
          video_id: summary.videoId,
          language: summary.language,
          spoken_language: summary.spokenLanguage,
          lengths: summary.lengths,
          created_at: summary.createdAt,
          ...ownerColumns(summary.ownerId),
          source: summary.source ?? "video",
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
