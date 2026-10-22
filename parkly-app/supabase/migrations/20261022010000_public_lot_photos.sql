-- Hand-written. Sprint 3: approved lot photos are public (C1, doc 06 §1.2
-- "public read"), served from Supabase Storage's CDN with permanent links so
-- public lot pages can be cached and indexed. Only the API writes to this
-- bucket, after an admin approves a photo (S2 slice E2); originals stay in
-- the private lot-photos bucket.
update storage.buckets set public = true where id = 'lot-photos-public';
