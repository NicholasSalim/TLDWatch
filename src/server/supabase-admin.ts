/**
 * The server's one full-access Supabase client (the service role key), made
 * on first use and shared by every adapter. Server-side only: it bypasses
 * row-level security, so the core's own checks are what guard the data.
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/server/env";

let client: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
  client ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
