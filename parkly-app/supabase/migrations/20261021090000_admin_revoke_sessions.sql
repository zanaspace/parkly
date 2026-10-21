-- Hand-written. FR-AUTH-006: an admin can end every session a user has.
-- Supabase Auth has no admin endpoint for this (auth.admin.signOut needs the
-- user's own JWT), so the API deletes the user's auth.sessions rows; their
-- refresh tokens cascade. Issued access tokens still expire within 15 min.
create or replace function public.fn_revoke_user_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

revoke execute on function public.fn_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.fn_revoke_user_sessions(uuid) to parkly_api;
