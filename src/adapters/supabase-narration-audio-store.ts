/**
 * Narration audio adapter: MP3s in the public Supabase Storage bucket
 * "narration" (see supabase/migrations). Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { NarrationAudioStore } from "@/core/ports";

const BUCKET = "narration";

export function createSupabaseNarrationAudioStore({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): NarrationAudioStore {
  const bucket = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);

  const publicUrl = (key: string) => bucket.getPublicUrl(key).data.publicUrl;

  return {
    async findAudio(key) {
      // A missing file comes back as `false` together with a "not found" error;
      // any other failure is thrown by exists() itself.
      const { data } = await bucket.exists(key);
      return data ? publicUrl(key) : null;
    },

    async saveAudio(key, mp3) {
      const { error } = await bucket.upload(key, mp3, {
        contentType: "audio/mpeg",
        // Audio for a (video, language, Length) never changes once made.
        cacheControl: "31536000",
        upsert: false,
      });
      // Another server made it first: keep theirs.
      if (error && !/exists|duplicate/i.test(error.message)) throw error;
      return publicUrl(key);
    },
  };
}
