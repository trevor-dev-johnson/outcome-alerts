create table public.market_probability_observations (
  market_id text not null check (length(market_id) between 1 and 120),
  bucket_at timestamptz not null,
  observed_at timestamptz not null,
  yes_probability numeric not null check (yes_probability >= 0 and yes_probability <= 1),
  primary key (market_id, bucket_at),
  check (observed_at >= bucket_at and observed_at < bucket_at + interval '5 minutes')
);

create index market_probability_observations_time
  on public.market_probability_observations (observed_at desc);

alter table public.market_probability_observations enable row level security;

revoke all
  on public.market_probability_observations
  from public, anon, authenticated;

grant all on public.market_probability_observations to service_role;

create or replace function public.closest_market_probability_observations(
  p_market_ids text[],
  p_target_at timestamptz,
  p_tolerance_seconds integer
) returns table (
  market_id text,
  bucket_at timestamptz,
  observed_at timestamptz,
  yes_probability numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_market_ids is null or cardinality(p_market_ids) = 0 then
    return;
  end if;

  if cardinality(p_market_ids) > 300 then
    raise exception 'At most 300 market IDs may be requested.' using errcode = '22023';
  end if;

  if p_target_at is null or not isfinite(p_target_at) then
    raise exception 'A finite target timestamp is required.' using errcode = '22023';
  end if;

  if p_tolerance_seconds is null or p_tolerance_seconds < 0 or p_tolerance_seconds > 600 then
    raise exception 'Tolerance must be between 0 and 600 seconds.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_market_ids) as requested(market_id)
    where requested.market_id is null or length(requested.market_id) not between 1 and 120
  ) then
    raise exception 'Market IDs must contain between 1 and 120 characters.' using errcode = '22023';
  end if;

  return query
  select distinct on (observation.market_id)
    observation.market_id,
    observation.bucket_at,
    observation.observed_at,
    observation.yes_probability
  from public.market_probability_observations as observation
  where observation.market_id = any(p_market_ids)
    and observation.observed_at between
      p_target_at - make_interval(secs => p_tolerance_seconds)
      and p_target_at + make_interval(secs => p_tolerance_seconds)
  order by
    observation.market_id,
    abs(extract(epoch from observation.observed_at - p_target_at)),
    observation.observed_at desc;
end;
$$;

alter function public.closest_market_probability_observations(text[], timestamptz, integer)
  owner to postgres;
revoke all on function public.closest_market_probability_observations(text[], timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.closest_market_probability_observations(text[], timestamptz, integer)
  to anon, authenticated, service_role;
