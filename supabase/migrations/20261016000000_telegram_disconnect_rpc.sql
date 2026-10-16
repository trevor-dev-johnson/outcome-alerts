begin;

-- Additive first stage: existing web versions can still disconnect until the
-- new RPC caller is deployed and the separate permission restriction is applied.
create or replace function public.disconnect_telegram()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.profiles
  set telegram_user_id = null,
      telegram_chat_id = null,
      telegram_username = null,
      telegram_connected_at = null
  where id = caller_id;

  return found;
end;
$$;

alter function public.disconnect_telegram() owner to postgres;
revoke all on function public.disconnect_telegram() from public, anon, authenticated, service_role;
grant execute on function public.disconnect_telegram() to authenticated;

commit;
