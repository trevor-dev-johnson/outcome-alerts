create table public.alert_delivery_claims (
  alert_id uuid primary key references public.alerts(id) on delete cascade,
  claim_id uuid not null unique,
  telegram_chat_id bigint not null,
  crossing_price numeric not null check (crossing_price >= 0 and crossing_price <= 1),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.alert_delivery_claims enable row level security;
revoke all on table public.alert_delivery_claims from anon, authenticated;
grant all on table public.alert_delivery_claims to service_role;

create or replace function public.claim_alert_delivery(
  p_alert_id uuid,
  p_claim_id uuid,
  p_current_price numeric
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_chat_id bigint;
begin
  insert into public.alert_delivery_claims (
    alert_id,
    claim_id,
    telegram_chat_id,
    crossing_price
  )
  select
    alert.id,
    p_claim_id,
    profile.telegram_chat_id,
    p_current_price
  from public.alerts as alert
  join public.profiles as profile on profile.id = alert.user_id
  where alert.id = p_alert_id
    and alert.status = 'active'
    and profile.telegram_chat_id is not null
  on conflict (alert_id) do nothing;

  select delivery.telegram_chat_id
  into claimed_chat_id
  from public.alert_delivery_claims as delivery
  where delivery.alert_id = p_alert_id
    and delivery.claim_id = p_claim_id;

  return claimed_chat_id;
end;
$$;

create or replace function public.complete_alert_delivery(
  p_alert_id uuid,
  p_claim_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.alert_delivery_claims%rowtype;
  updated_count integer;
begin
  select *
  into delivery
  from public.alert_delivery_claims
  where alert_id = p_alert_id
    and claim_id = p_claim_id
  for update;

  if not found then
    return false;
  end if;

  if delivery.completed_at is not null then
    return true;
  end if;

  update public.alerts
  set status = 'triggered',
      triggered_at = now(),
      last_observed_price = delivery.crossing_price
  where id = p_alert_id
    and status = 'active';

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    return false;
  end if;

  update public.alert_delivery_claims
  set completed_at = now()
  where alert_id = p_alert_id
    and claim_id = p_claim_id;

  return true;
end;
$$;

create or replace function public.clear_alert_delivery_claim_on_rearm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.alert_delivery_claims where alert_id = new.id;
  return new;
end;
$$;

create trigger alerts_clear_delivery_claim_on_rearm
after update of status on public.alerts
for each row
when (new.status = 'active' and old.status is distinct from 'active')
execute procedure public.clear_alert_delivery_claim_on_rearm();

revoke all on function public.claim_alert_delivery(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.complete_alert_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.clear_alert_delivery_claim_on_rearm() from public, anon, authenticated;
grant execute on function public.claim_alert_delivery(uuid, uuid, numeric) to service_role;
grant execute on function public.complete_alert_delivery(uuid, uuid) to service_role;

