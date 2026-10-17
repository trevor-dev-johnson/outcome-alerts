begin;

alter table public.alerts
  add column arm_generation bigint not null default 1,
  add constraint alerts_arm_generation_positive check (arm_generation > 0);

create or replace function public.set_alert_arm_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation_requested boolean;
begin
  generation_requested :=
    new.arm_generation is distinct from old.arm_generation
    or (new.status = 'active' and old.status is distinct from 'active')
    or new.market_id is distinct from old.market_id
    or new.outcome is distinct from old.outcome
    or new.operator is distinct from old.operator
    or new.threshold is distinct from old.threshold;

  if generation_requested then
    new.arm_generation := old.arm_generation + 1;
    if new.status = 'active' then
      new.last_observed_price := null;
      new.triggered_at := null;
    end if;
  else
    -- Only this trigger owns the monotonic generation value.
    new.arm_generation := old.arm_generation;
  end if;

  return new;
end;
$$;

alter function public.set_alert_arm_generation() owner to postgres;
revoke all on function public.set_alert_arm_generation() from public, anon, authenticated;

create trigger alerts_set_arm_generation
before update of arm_generation, status, market_id, outcome, operator, threshold
on public.alerts
for each row
execute procedure public.set_alert_arm_generation();

alter table public.alert_delivery_claims add column arm_generation bigint;

update public.alert_delivery_claims as delivery
set arm_generation = alert.arm_generation
from public.alerts as alert
where alert.id = delivery.alert_id;

alter table public.alert_delivery_claims
  alter column arm_generation set not null,
  add constraint alert_delivery_claims_arm_generation_positive check (arm_generation > 0);

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

alter function public.clear_alert_delivery_claim_on_rearm() owner to postgres;
revoke all on function public.clear_alert_delivery_claim_on_rearm() from public, anon, authenticated;

drop trigger alerts_clear_delivery_claim_on_rearm on public.alerts;
create trigger alerts_clear_delivery_claim_on_rearm
after update of arm_generation on public.alerts
for each row
when (new.arm_generation is distinct from old.arm_generation)
execute procedure public.clear_alert_delivery_claim_on_rearm();

create or replace function public.claim_alert_delivery_for_generation(
  p_alert_id uuid,
  p_arm_generation bigint,
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
  -- Serialize claims with re-arm/configuration updates. The re-arm trigger
  -- locks the alert before deleting its claim, so every competing path must
  -- acquire locks in the same alert-then-claim order.
  select profile.telegram_chat_id
  into claimed_chat_id
  from public.alerts as alert
  join public.profiles as profile on profile.id = alert.user_id
  where alert.id = p_alert_id
    and alert.status = 'active'
    and alert.arm_generation = p_arm_generation
    and profile.telegram_chat_id is not null
  for update of alert;

  if claimed_chat_id is null then
    return null;
  end if;

  insert into public.alert_delivery_claims (
    alert_id,
    arm_generation,
    claim_id,
    telegram_chat_id,
    crossing_price
  ) values (
    p_alert_id,
    p_arm_generation,
    p_claim_id,
    claimed_chat_id,
    p_current_price
  )
  on conflict (alert_id) do nothing;

  select delivery.telegram_chat_id
  into claimed_chat_id
  from public.alert_delivery_claims as delivery
  where delivery.alert_id = p_alert_id
    and delivery.arm_generation = p_arm_generation
    and delivery.claim_id = p_claim_id;

  return claimed_chat_id;
end;
$$;

create or replace function public.complete_alert_delivery_for_generation(
  p_alert_id uuid,
  p_arm_generation bigint,
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
  -- Rearm/configuration changes lock the alert before deleting its claim.
  -- Match that order to avoid an alert/claim deadlock, while retaining
  -- idempotent completion after the alert has already become triggered.
  perform 1
  from public.alerts
  where id = p_alert_id
    and arm_generation = p_arm_generation
  for update;

  if not found then
    return false;
  end if;

  select *
  into delivery
  from public.alert_delivery_claims
  where alert_id = p_alert_id
    and arm_generation = p_arm_generation
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
    and status = 'active'
    and arm_generation = p_arm_generation;

  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    return false;
  end if;

  update public.alert_delivery_claims
  set completed_at = now()
  where alert_id = p_alert_id
    and arm_generation = p_arm_generation
    and claim_id = p_claim_id;

  return true;
end;
$$;

alter function public.claim_alert_delivery_for_generation(uuid, bigint, uuid, numeric) owner to postgres;
alter function public.complete_alert_delivery_for_generation(uuid, bigint, uuid) owner to postgres;
revoke all on function public.claim_alert_delivery_for_generation(uuid, bigint, uuid, numeric) from public, anon, authenticated;
revoke all on function public.complete_alert_delivery_for_generation(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_alert_delivery_for_generation(uuid, bigint, uuid, numeric) to service_role;
grant execute on function public.complete_alert_delivery_for_generation(uuid, bigint, uuid) to service_role;

-- Keep the service-role-only legacy signatures operational during the
-- controlled worker rollout. They delegate to the generation-aware functions,
-- so the new non-null claim column cannot interrupt the currently running worker.
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
  current_generation bigint;
begin
  select arm_generation
  into current_generation
  from public.alerts
  where id = p_alert_id;

  if current_generation is null then
    return null;
  end if;

  return public.claim_alert_delivery_for_generation(
    p_alert_id,
    current_generation,
    p_claim_id,
    p_current_price
  );
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
  claimed_generation bigint;
begin
  select arm_generation
  into claimed_generation
  from public.alert_delivery_claims
  where alert_id = p_alert_id
    and claim_id = p_claim_id;

  if claimed_generation is null then
    return false;
  end if;

  return public.complete_alert_delivery_for_generation(
    p_alert_id,
    claimed_generation,
    p_claim_id
  );
end;
$$;

alter function public.claim_alert_delivery(uuid, uuid, numeric) owner to postgres;
alter function public.complete_alert_delivery(uuid, uuid) owner to postgres;
revoke all on function public.claim_alert_delivery(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.complete_alert_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_alert_delivery(uuid, uuid, numeric) to service_role;
grant execute on function public.complete_alert_delivery(uuid, uuid) to service_role;

commit;
