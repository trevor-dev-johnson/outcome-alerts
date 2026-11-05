begin;

-- Additive, independent of alerts/alert_delivery_claims and existing grants.
create table public.radar_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.radar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.radar_accounts(user_id) on delete cascade,
  target_kind text not null check (target_kind in ('market', 'category')),
  target text not null check (length(target) between 1 and 120),
  window_name text not null check (window_name in ('5m', '1h', '24h')),
  threshold_points numeric not null check (threshold_points between 1 and 100),
  generation bigint not null default 1 check (generation > 0),
  paused boolean not null default false,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, target_kind, target, window_name),
  check ((target_kind = 'market' and target ~ '^[0-9]+$') or (target_kind = 'category' and target in ('NBA', 'NFL')))
);
create table public.radar_events (
  id uuid primary key,
  user_id uuid not null references public.radar_accounts(user_id) on delete cascade,
  -- Intentionally retained after subscription removal: deletion must not reset rate limits.
  subscription_id uuid not null,
  generation bigint not null,
  target_kind text not null,
  target text not null,
  window_name text not null,
  market_id text not null,
  current_bucket timestamptz not null,
  baseline_bucket timestamptz not null,
  current_at timestamptz not null,
  baseline_at timestamptz not null,
  current_probability numeric not null check (current_probability between 0 and 1),
  baseline_probability numeric not null check (baseline_probability between 0 and 1),
  channel text not null default 'telegram' check (channel = 'telegram'),
  status text not null default 'reserved' check (status in ('reserved', 'sending', 'sent', 'uncertain', 'cancelled')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(subscription_id, generation, market_id, current_bucket)
);
create index radar_events_user_time on public.radar_events(user_id, created_at desc);
create index radar_events_retention on public.radar_events(created_at);
create index radar_subscriptions_active on public.radar_subscriptions(id) where not paused;

alter table public.radar_accounts enable row level security;
alter table public.radar_subscriptions enable row level security;
alter table public.radar_events enable row level security;
revoke all on public.radar_accounts, public.radar_subscriptions, public.radar_events from public, anon, authenticated;
grant select on public.radar_subscriptions, public.radar_events to authenticated;
create policy radar_subscription_owner_read on public.radar_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy radar_event_owner_read on public.radar_events for select to authenticated using (user_id = (select auth.uid()));
grant all on public.radar_accounts, public.radar_subscriptions, public.radar_events to service_role;

create function public.create_radar_subscription(p_kind text, p_target text, p_window text, p_threshold numeric, p_consent boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); result uuid;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_consent is distinct from true then raise exception 'Explicit consent required'; end if;
  insert into public.radar_accounts(user_id) values(caller) on conflict do nothing;
  perform 1 from public.radar_accounts where user_id = caller for update;
  if (select count(*) from public.radar_subscriptions where user_id = caller) >= 20 then
    raise exception 'Maximum 20 Radar subscriptions';
  end if;
  insert into public.radar_subscriptions(user_id, target_kind, target, window_name, threshold_points)
    values(caller, p_kind, p_target, p_window, p_threshold) returning id into result;
  return result;
end;
$$;

create function public.manage_radar_subscription(p_id uuid, p_operation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  perform 1 from public.radar_accounts where user_id = caller for update;
  if p_operation = 'remove' then
    delete from public.radar_subscriptions where id = p_id and user_id = caller;
  elsif p_operation in ('pause', 'resume') then
    update public.radar_subscriptions set paused = (p_operation = 'pause'), generation = generation + 1
      where id = p_id and user_id = caller and paused is distinct from (p_operation = 'pause');
  else raise exception 'Invalid operation';
  end if;
  return found;
end;
$$;

-- All competing operations lock account -> subscription -> event, never the reverse.
-- Only the service role may propose category matches; authoritative metadata is
-- validated by the worker. Probabilities/times are loaded from persisted history here.
create function public.claim_radar_event(p_subscription uuid, p_generation bigint, p_market text,
  p_current_bucket timestamptz, p_baseline_bucket timestamptz, p_event uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid; s public.radar_subscriptions%rowtype;
  c public.market_probability_observations%rowtype; b public.market_probability_observations%rowtype;
  duration_seconds integer; tolerance_seconds integer;
begin
  select user_id into owner_id from public.radar_subscriptions where id = p_subscription;
  if owner_id is null then return false; end if;
  perform 1 from public.radar_accounts where user_id = owner_id for update;
  select * into s from public.radar_subscriptions where id = p_subscription for update;
  if not found or s.paused or s.generation is distinct from p_generation then return false; end if;
  if s.target_kind = 'market' and s.target <> p_market then return false; end if;
  if not exists(select 1 from public.profiles where id = owner_id and telegram_chat_id is not null) then return false; end if;
  -- Idempotent recovery of a lost reservation response, never of a send attempt.
  if exists(select 1 from public.radar_events where id = p_event and subscription_id = s.id
    and generation = p_generation and market_id = p_market and current_bucket = p_current_bucket
    and baseline_bucket = p_baseline_bucket and status = 'reserved') then return true; end if;
  select * into c from public.market_probability_observations where market_id = p_market and bucket_at = p_current_bucket;
  if not found then return false; end if;
  select * into b from public.market_probability_observations where market_id = p_market and bucket_at = p_baseline_bucket;
  if not found then return false; end if;
  duration_seconds := case s.window_name when '5m' then 300 when '1h' then 3600 else 86400 end;
  tolerance_seconds := case s.window_name when '5m' then 150 when '1h' then 300 else 600 end;
  if c.observed_at > clock_timestamp() or c.observed_at < clock_timestamp() - interval '60 seconds'
    or c.bucket_at = b.bucket_at or c.observed_at - b.observed_at < interval '150 seconds'
    or abs(extract(epoch from c.observed_at - b.observed_at) - duration_seconds) > tolerance_seconds
    or abs(c.yes_probability - b.yes_probability) * 100 < s.threshold_points then return false; end if;
  -- One event per subscription/hour, one per market/window/user/hour even across
  -- overlapping follows, and six reserved attempts/user/hour. Failed sends count.
  if exists(select 1 from public.radar_events where user_id = owner_id and created_at > clock_timestamp() - interval '1 hour'
    and ((target_kind = s.target_kind and target = s.target and window_name = s.window_name)
      or (market_id = p_market and window_name = s.window_name))) then return false; end if;
  if (select count(*) from public.radar_events where user_id = owner_id and created_at > clock_timestamp() - interval '1 hour') >= 6 then return false; end if;
  insert into public.radar_events(id, user_id, subscription_id, generation, target_kind, target, window_name,
    market_id, current_bucket, baseline_bucket, current_at, baseline_at, current_probability, baseline_probability)
  values(p_event, owner_id, s.id, s.generation, s.target_kind, s.target, s.window_name,
    p_market, c.bucket_at, b.bucket_at, c.observed_at, b.observed_at, c.yes_probability, b.yes_probability)
  on conflict do nothing;
  return found;
end;
$$;

-- Single-use send gate. Never retry a Telegram request after this succeeds.
create function public.begin_radar_delivery(p_event uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare owner_id uuid; sub_id uuid; s public.radar_subscriptions%rowtype; e public.radar_events%rowtype; chat bigint;
begin
  select user_id, subscription_id into owner_id, sub_id from public.radar_events where id = p_event;
  if owner_id is null then return null; end if;
  perform 1 from public.radar_accounts where user_id = owner_id for update;
  select * into s from public.radar_subscriptions where id = sub_id for update;
  select * into e from public.radar_events where id = p_event for update;
  if not found or e.status is distinct from 'reserved' then return null; end if;
  select telegram_chat_id into chat from public.profiles where id = owner_id;
  if s.id is null or s.paused or s.generation <> e.generation or chat is null
    or e.current_at < clock_timestamp() - interval '60 seconds' then
    update public.radar_events set status = 'cancelled', finished_at = clock_timestamp() where id = p_event;
    return null;
  end if;
  update public.radar_events set status = 'sending' where id = p_event;
  return chat;
end;
$$;

create function public.finish_radar_delivery(p_event uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('sent', 'uncertain') or p_status is null then raise exception 'Invalid delivery status'; end if;
  -- This operation takes only the event lock and never subsequently locks its
  -- parent; no inverted lock dependency. Repeated completions cannot reopen it.
  update public.radar_events set status = p_status, finished_at = clock_timestamp()
    where id = p_event and status = 'sending';
end;
$$;

alter function public.create_radar_subscription(text,text,text,numeric,boolean) owner to postgres;
alter function public.manage_radar_subscription(uuid,text) owner to postgres;
alter function public.claim_radar_event(uuid,bigint,text,timestamptz,timestamptz,uuid) owner to postgres;
alter function public.begin_radar_delivery(uuid) owner to postgres;
alter function public.finish_radar_delivery(uuid,text) owner to postgres;
revoke all on function public.create_radar_subscription(text,text,text,numeric,boolean), public.manage_radar_subscription(uuid,text),
  public.claim_radar_event(uuid,bigint,text,timestamptz,timestamptz,uuid), public.begin_radar_delivery(uuid), public.finish_radar_delivery(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_radar_subscription(text,text,text,numeric,boolean), public.manage_radar_subscription(uuid,text) to authenticated;
grant execute on function public.claim_radar_event(uuid,bigint,text,timestamptz,timestamptz,uuid), public.begin_radar_delivery(uuid), public.finish_radar_delivery(uuid,text) to service_role;
commit;
