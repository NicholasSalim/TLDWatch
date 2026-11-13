/**
 * Member store adapter: Member profiles in the Supabase `members` table
 * (see supabase/migrations). Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Member, MemberStore } from "@/core/ports";

type MemberRow = { id: string; adult_confirmed_at: string; autoplay: boolean };

const fromRow = (row: MemberRow): Member => ({
  id: row.id,
  adultConfirmedAt: row.adult_confirmed_at,
  autoplay: row.autoplay,
});

export function createSupabaseMemberStore({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): MemberStore {
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function findMember(id: string) {
    const { data, error } = await db
      .from("members")
      .select("id, adult_confirmed_at, autoplay")
      .eq("id", id)
      .maybeSingle<MemberRow>();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }

  return {
    findMember,

    async createMember(member) {
      const { error } = await db.from("members").upsert(
        { id: member.id, adult_confirmed_at: member.adultConfirmedAt, autoplay: member.autoplay },
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw error;
      const stored = await findMember(member.id);
      if (!stored) throw new Error(`Member ${member.id} vanished after saving`);
      return stored;
    },

    async deleteMember(id) {
      const { error } = await db.from("members").delete().eq("id", id);
      if (error) throw error;
    },

    async setAutoplay(id, on) {
      const { error } = await db.from("members").update({ autoplay: on }).eq("id", id);
      if (error) throw error;
    },
  };
}
