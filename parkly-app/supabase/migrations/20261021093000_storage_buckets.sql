-- Hand-written. Storage buckets (doc 05 V12 + §263, doc 06 §2).
-- Every bucket is private: no storage.objects policies exist for anon or
-- authenticated, so clients can only use API-issued signed URLs. Size and type
-- limits here are a second line behind the API's own checks.
-- Document buckets also accept image/webp: the API re-encodes uploaded images
-- to WebP and writes them back.
-- lot-photos-public stays private until Sprint 3 decides how approved photos
-- are served (public CDN bucket vs signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kyb-docs', 'kyb-docs', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('permits', 'permits', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('verification', 'verification', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('lot-photos', 'lot-photos', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('lot-photos-public', 'lot-photos-public', false, 10485760,
    array['image/webp']),
  ('incident-evidence', 'incident-evidence', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('exports', 'exports', false, 52428800,
    array['application/json', 'application/pdf', 'text/csv', 'application/zip'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
