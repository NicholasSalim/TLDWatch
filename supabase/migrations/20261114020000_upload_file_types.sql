-- Uploads take audio, PDFs and images as well as video (ADR-0004). The
-- browser uploads each file with the type TLDWatch found in its bytes, and
-- the bucket refuses anything else. Text files never reach Storage: the
-- browser reads them and sends them like a pasted text.
update storage.buckets
set allowed_mime_types = array[
  'video/*',
  'audio/mp3', 'audio/aac', 'audio/m4a', 'audio/wav', 'audio/aiff', 'audio/ogg', 'audio/flac',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'
]
where id = 'uploads';
