-- Allow an authenticated user to rotate only their own password.
--
-- The API role still has no table-wide UPDATE privilege. PostgreSQL combines
-- this column-level grant with the forced users_identity_isolation RLS policy,
-- so the caller can only update password_hash/updated_at for app.current_user_id.

grant update (password_hash, updated_at) on public.users to factupapa_api;
