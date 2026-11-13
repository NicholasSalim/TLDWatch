/**
 * History store adapter: the Supabase `history` table (see
 * supabase/migrations). Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { HistoryEntry, HistoryStore } from "@/core/ports";

type HistoryRow = {
  member_id: string;
  video_id: string;
  language: HistoryEntry["language"];
  opened_at: string;
};

export function createSupabaseHistoryStore({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): HistoryStore {
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async recordOpened(entry) {
      // One row per Member and video: opening it again moves it to the top.
      const { error } = await db.from("history").upsert(
        {
          member_id: entry.memberId,
          video_id: entry.videoId,
          language: entry.language,
          opened_at: entry.openedAt,
        },
        { onConflict: "member_id,video_id" },
      );
      if (error) throw error;
    },

    async listHistory(memberId, limit, before) {
      let query = db
        .from("history")
        .select("member_id, video_id, language, opened_at")
        .eq("member_id", memberId);
      if (before) query = query.lt("opened_at", before);
      const { data, error } = await query
        .order("opened_at", { ascending: false })
        .limit(limit)
        .returns<HistoryRow[]>();
      if (error) throw error;
      return data.map((row) => ({
        memberId: row.member_id,
        videoId: row.video_id,
        language: row.language,
        openedAt: row.opened_at,
      }));
    },

    async removeEntry(memberId, videoId) {
      const { error } = await db
        .from("history")
        .delete()
        .eq("member_id", memberId)
        .eq("video_id", videoId);
      if (error) throw error;
    },
  };
}
