create table public.market_current_snapshot_batches (
  batch_id uuid primary key default gen_random_uuid(),
  observed_at timestamptz not null unique,
  market_count integer not null check (market_count between 1 and 900),
  published_at timestamptz not null default clock_timestamp()
);

create table public.market_current_snapshot_markets (
  batch_id uuid not null references public.market_current_snapshot_batches(batch_id) on delete cascade,
  market_id text not null check (length(market_id) between 1 and 120),
  market_name text not null check (length(market_name) between 1 and 500),
  category text check (category is null or length(category) between 1 and 100),
  venue text check (venue is null or length(venue) between 1 and 120),
  protocol_native boolean not null default false,
  closes_at timestamptz,
  yes_probability numeric not null check (yes_probability between 0 and 1),
  no_probability numeric not null check (no_probability between 0 and 1),
  primary key (batch_id, market_id)
);

create index market_current_snapshot_batches_observed
  on public.market_current_snapshot_batches (observed_at desc);

alter table public.market_current_snapshot_batches enable row level security;
alter table public.market_current_snapshot_markets enable row level security;

revoke all on public.market_current_snapshot_batches from public, anon, authenticated;
revoke all on public.market_current_snapshot_markets from public, anon, authenticated;
grant all on public.market_current_snapshot_batches to service_role;
grant all on public.market_current_snapshot_markets to service_role;

create or replace function public.publish_market_current_snapshot(
  p_observed_at timestamptz,
  p_markets jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_id uuid;
  v_market_count integer;
begin
  if p_observed_at is null or not isfinite(p_observed_at) then
    raise exception 'A finite observation timestamp is required.' using errcode = '22023';
  end if;

  if p_observed_at > clock_timestamp() + interval '1 minute'
     or p_observed_at < clock_timestamp() - interval '15 minutes' then
    raise exception 'Observation timestamp is outside the publication window.' using errcode = '22023';
  end if;

  if p_markets is null or jsonb_typeof(p_markets) <> 'array' then
    raise exception 'Markets must be a JSON array.' using errcode = '22023';
  end if;

  v_market_count := jsonb_array_length(p_markets);
  if v_market_count < 1 or v_market_count > 900 then
    raise exception 'Snapshot must contain between 1 and 900 markets.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_markets) as market(
      market_id text,
      market_name text,
      category text,
      venue text,
      protocol_native boolean,
      closes_at timestamptz,
      yes_probability numeric,
      no_probability numeric
    )
    where market.market_id is null
       or length(market.market_id) not between 1 and 120
       or market.market_name is null
       or length(market.market_name) not between 1 and 500
       or (market.category is not null and length(market.category) not between 1 and 100)
       or (market.venue is not null and length(market.venue) not between 1 and 120)
       or market.yes_probability is null
       or market.yes_probability < 0
       or market.yes_probability > 1
       or market.no_probability is null
       or market.no_probability < 0
       or market.no_probability > 1
  ) then
    raise exception 'Snapshot contains an invalid market.' using errcode = '22023';
  end if;

  if (
    select count(distinct market.market_id)
    from jsonb_to_recordset(p_markets) as market(market_id text)
  ) <> v_market_count then
    raise exception 'Snapshot market IDs must be unique.' using errcode = '22023';
  end if;

  insert into public.market_current_snapshot_batches(observed_at, market_count)
  values (p_observed_at, v_market_count)
  on conflict (observed_at) do update
    set market_count = excluded.market_count,
        published_at = clock_timestamp()
  returning batch_id into v_batch_id;

  delete from public.market_current_snapshot_markets
  where batch_id = v_batch_id;

  insert into public.market_current_snapshot_markets(
    batch_id,
    market_id,
    market_name,
    category,
    venue,
    protocol_native,
    closes_at,
    yes_probability,
    no_probability
  )
  select
    v_batch_id,
    market.market_id,
    market.market_name,
    market.category,
    market.venue,
    coalesce(market.protocol_native, false),
    market.closes_at,
    market.yes_probability,
    market.no_probability
  from jsonb_to_recordset(p_markets) as market(
    market_id text,
    market_name text,
    category text,
    venue text,
    protocol_native boolean,
    closes_at timestamptz,
    yes_probability numeric,
    no_probability numeric
  );

  delete from public.market_current_snapshot_batches
  where batch_id <> v_batch_id
    and observed_at < p_observed_at - interval '20 minutes';

  return v_market_count;
end;
$$;

alter function public.publish_market_current_snapshot(timestamptz, jsonb) owner to postgres;
revoke all on function public.publish_market_current_snapshot(timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_market_current_snapshot(timestamptz, jsonb)
  to service_role;

create or replace function public.read_market_movers_fallback(
  p_window text,
  p_max_age_seconds integer
) returns table (
  snapshot_observed_at timestamptz,
  snapshot_market_count integer,
  market_id text,
  market_name text,
  category text,
  venue text,
  protocol_native boolean,
  closes_at timestamptz,
  yes_probability numeric,
  no_probability numeric,
  historical_bucket_at timestamptz,
  historical_observed_at timestamptz,
  historical_yes_probability numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_duration interval;
  v_tolerance interval;
begin
  if p_max_age_seconds is null or p_max_age_seconds < 1 or p_max_age_seconds > 600 then
    raise exception 'Maximum age must be between 1 and 600 seconds.' using errcode = '22023';
  end if;

  case p_window
    when '5m' then
      v_duration := interval '5 minutes';
      v_tolerance := interval '2 minutes 30 seconds';
    when '1h' then
      v_duration := interval '1 hour';
      v_tolerance := interval '5 minutes';
    when '24h' then
      v_duration := interval '24 hours';
      v_tolerance := interval '10 minutes';
    else
      raise exception 'Unsupported Movers window.' using errcode = '22023';
  end case;

  return query
  with latest_batch as (
    select batch.batch_id, batch.observed_at, batch.market_count
    from public.market_current_snapshot_batches as batch
    where batch.observed_at <= current_timestamp
      and batch.observed_at >= current_timestamp - make_interval(secs => p_max_age_seconds)
      and (
        select count(*)
        from public.market_current_snapshot_markets as counted
        where counted.batch_id = batch.batch_id
      ) = batch.market_count
    order by batch.observed_at desc
    limit 1
  )
  select
    batch.observed_at,
    batch.market_count,
    current_market.market_id,
    current_market.market_name,
    current_market.category,
    current_market.venue,
    current_market.protocol_native,
    current_market.closes_at,
    current_market.yes_probability,
    current_market.no_probability,
    historical.bucket_at,
    historical.observed_at,
    historical.yes_probability
  from latest_batch as batch
  join public.market_current_snapshot_markets as current_market
    on current_market.batch_id = batch.batch_id
  left join lateral (
    select observation.bucket_at, observation.observed_at, observation.yes_probability
    from public.market_probability_observations as observation
    where observation.market_id = current_market.market_id
      and observation.observed_at between
        batch.observed_at - v_duration - v_tolerance
        and batch.observed_at - v_duration + v_tolerance
    order by
      abs(extract(epoch from observation.observed_at - (batch.observed_at - v_duration))),
      observation.observed_at desc
    limit 1
  ) as historical on true
  where current_market.closes_at is null or current_market.closes_at > batch.observed_at
  order by current_market.market_id;
end;
$$;

alter function public.read_market_movers_fallback(text, integer) owner to postgres;
revoke all on function public.read_market_movers_fallback(text, integer)
  from public, anon, authenticated;
grant execute on function public.read_market_movers_fallback(text, integer)
  to anon, authenticated, service_role;
