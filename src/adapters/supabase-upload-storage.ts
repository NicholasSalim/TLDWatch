/**
 * Upload storage adapter: the private Supabase Storage bucket "uploads" (see
 * supabase/migrations). Files only wait here while they're summarized.
 * Server-side only, with the service role key.
 */
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { UploadStorage } from "@/core/ports";

const BUCKET = "uploads";

export function createSupabaseUploadStorage({
  url,
  serviceRoleKey,
}: {
  url: string;
  serviceRoleKey: string;
}): UploadStorage {
  const bucket = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);

  return {
    async createUploadUrl(path) {
      // A short-lived URL (about two hours): the browser PUTs the file straight to Storage.
      const { data, error } = await bucket.createSignedUploadUrl(path);
      if (error) throw error;
      return data.signedUrl;
    },

    async read(path) {
      const { data, error } = await bucket.download(path);
      if (error) {
        if (/not found/i.test(error.message)) return null;
        throw error;
      }
      // The type it was uploaded as (empty if none): the core checks it against the bytes.
      return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: data.type || "" };
    },

    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw error;
    },

    async removeAllFor(memberId) {
      const { data: files, error } = await bucket.list(memberId, { limit: 1000 });
      if (error) throw error;
      if (files.length) {
        const { error: removeError } = await bucket.remove(files.map((f) => `${memberId}/${f.name}`));
        if (removeError) throw removeError;
      }
    },

    async removeOlderThan(cutoff) {
      // One folder per Member; each holds at most a few files waiting to be summarized.
      const { data: folders, error } = await bucket.list("", { limit: 1000 });
      if (error) throw error;
      const old: string[] = [];
      for (const folder of folders) {
        const { data: files, error: listError } = await bucket.list(folder.name, { limit: 1000 });
        if (listError) throw listError;
        for (const file of files) {
          if (file.created_at && file.created_at < cutoff) old.push(`${folder.name}/${file.name}`);
        }
      }
      if (old.length) {
        const { error: removeError } = await bucket.remove(old);
        if (removeError) throw removeError;
      }
      return old.length;
    },
  };
}
