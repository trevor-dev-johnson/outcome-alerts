begin;

-- Profiles currently contain only identity, creation time and Telegram fields.
-- No client-side edit needs direct UPDATE; disconnect uses the narrow RPC below.
-- Table and column grants are independent, so revoke both (including PUBLIC).
revoke update on table public.profiles from public, anon, authenticated;
revoke update (id, telegram_user_id, telegram_chat_id, telegram_username,
  telegram_connected_at, created_at)
  on table public.profiles from public, anon, authenticated;
drop policy if exists "profiles_update_own" on public.profiles;

-- Preserve the trusted bot's existing token-consumption path and worker reads.
grant select, update on table public.profiles to service_role;

-- Apply only after the additive RPC migration and the web RPC caller are live.
-- No existing profile values are rewritten. See PHASE1_REVIEW.md for rollout.
commit;
