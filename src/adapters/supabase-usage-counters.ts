/**
 * Usage counters adapter: daily counters in the Supabase `usage_counters`
 * table, changed only through its atomic functions (see supabase/migrations).
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { UsageCounters } from "@/core/ports";

export function createSupabaseUsageCounters({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): UsageCounters {
  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async tryUse(counter, day, amount, limit) {
      const { data, error } = await db.rpc("try_use_usage", {
        p_counter: counter,
        p_day: day,
        p_amount: amount,
        p_limit: limit,
      });
      if (error) throw error;
      return data === true;
    },

    async giveBack(counter, day, amount) {
      const { error } = await db.rpc("give_back_usage", {
        p_counter: counter,
        p_day: day,
        p_amount: amount,
      });
      if (error) throw error;
    },

    async used(counter, day) {
      const { data, error } = await db
        .from("usage_counters")
        .select("used")
        .eq("counter", counter)
        .eq("day", day)
        .maybeSingle<{ used: number }>();
      if (error) throw error;
      return data?.used ?? 0;
    },
  };
}
