-- Natural voice Narration audio: one MP3 per (video, language, Length), made
-- once and reused by everyone. Public to read, like the Summaries it narrates;
-- only the server (service role) writes it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('narration', 'narration', true, 5242880, array['audio/mpeg'])
on conflict (id) do nothing;
