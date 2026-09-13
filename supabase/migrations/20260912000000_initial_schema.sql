create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint,
  telegram_chat_id bigint,
  telegram_username text,
  telegram_connected_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.telegram_connection_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index telegram_connection_tokens_lookup on public.telegram_connection_tokens(token_hash) where used_at is null;

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id text not null,
  market_name text not null,
  outcome text not null check (outcome in ('YES','NO')),
  operator text not null check (operator in ('above','below')),
  threshold numeric not null check (threshold > 0 and threshold < 1),
  status text not null default 'active' check (status in ('active','triggered','disabled')),
  last_observed_price numeric check (last_observed_price is null or (last_observed_price >= 0 and last_observed_price <= 1)),
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alerts_active_market on public.alerts(market_id, outcome) where status = 'active';
create index alerts_user_status on public.alerts(user_id, status);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger alerts_set_updated_at before update on public.alerts for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.telegram_connection_tokens enable row level security;
alter table public.alerts enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "tokens_insert_own" on public.telegram_connection_tokens for insert with check (auth.uid() = user_id);
create policy "tokens_select_own" on public.telegram_connection_tokens for select using (auth.uid() = user_id);
create policy "alerts_select_own" on public.alerts for select using (auth.uid() = user_id);
create policy "alerts_insert_own" on public.alerts for insert with check (auth.uid() = user_id);
create policy "alerts_update_own" on public.alerts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alerts_delete_own" on public.alerts for delete using (auth.uid() = user_id);

create or replace function public.consume_telegram_connection_token(
  p_token_hash text, p_telegram_user_id bigint, p_telegram_chat_id bigint, p_telegram_username text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  update public.telegram_connection_tokens set used_at = now()
  where token_hash = p_token_hash and used_at is null and expires_at > now()
  returning user_id into target_user;
  if target_user is null then return false; end if;
  update public.profiles set telegram_user_id=p_telegram_user_id, telegram_chat_id=p_telegram_chat_id,
    telegram_username=p_telegram_username, telegram_connected_at=now() where id=target_user;
  return true;
end; $$;
revoke all on function public.consume_telegram_connection_token(text,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.consume_telegram_connection_token(text,bigint,bigint,text) to service_role;
