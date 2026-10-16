\set ON_ERROR_STOP on
-- Run ONLY in a fresh disposable local database named oddsup_phase1_test.
-- This bootstraps a minimal Supabase role/auth context, not the hosted Auth API.
do $$ begin
  if current_database() <> 'oddsup_phase1_test'
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'Refusing to run outside the named disposable loopback database';
  end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

\ir ../supabase/migrations/20260912000000_initial_schema.sql
\ir ../supabase/migrations/20260914000000_reliable_alert_delivery.sql
\ir ../supabase/migrations/20260930000000_market_probability_history.sql

insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
insert into public.telegram_connection_tokens(user_id, token_hash, expires_at) values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-token-a', now() + interval '10 minutes'),
  ('00000000-0000-4000-8000-000000000002', 'synthetic-token-b', now() + interval '10 minutes');
set role service_role;
select public.consume_telegram_connection_token('synthetic-token-a', 101, 201, 'test_a');
select public.consume_telegram_connection_token('synthetic-token-b', 102, 202, 'test_b');
reset role;
create temporary table preserved_profiles as select * from public.profiles;
-- Exercise independent column grants as well as the deployed table grants.
grant update (telegram_chat_id) on public.profiles to authenticated;

\ir ../supabase/migrations/20261016000000_telegram_disconnect_rpc.sql
-- Additive stage must not break the previous application's disconnect path.
do $$ begin
  if not has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'Additive stage prematurely revoked old caller permissions';
  end if;
end $$;
\ir ../supabase/migrations/20261016000100_protect_telegram_profile_binding.sql

do $$
declare r text; col text; f record;
begin
  if exists ((select * from public.profiles except select * from preserved_profiles)
    union all (select * from preserved_profiles except select * from public.profiles)) then
    raise exception 'Migration altered an existing connection';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.profiles', 'UPDATE') then raise exception 'Table UPDATE remains for %', r; end if;
    foreach col in array array['id', 'created_at', 'telegram_user_id', 'telegram_chat_id', 'telegram_username', 'telegram_connected_at'] loop
      if has_column_privilege(r, 'public.profiles', col, 'UPDATE') then raise exception 'Column UPDATE remains for %.%', r, col; end if;
    end loop;
    if has_schema_privilege(r, 'public', 'CREATE') then raise exception 'Client can create/replace public objects'; end if;
    if has_function_privilege(r, 'public.consume_telegram_connection_token(text,bigint,bigint,text)', 'EXECUTE') then raise exception 'Client can bind directly'; end if;
  end loop;
  if not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then raise exception 'Worker update revoked'; end if;
  select * into f from pg_proc where oid='public.disconnect_telegram()'::regprocedure;
  if not f.prosecdef or pg_get_userbyid(f.proowner) <> 'postgres'
    or f.proconfig is distinct from array['search_path=""'] then raise exception 'Unsafe RPC metadata'; end if;
  if exists(select 1 from aclexplode(f.proacl) where grantee=0 and privilege_type='EXECUTE') then raise exception 'PUBLIC can execute'; end if;
  if has_function_privilege('anon', f.oid, 'EXECUTE') or has_function_privilege('service_role', f.oid, 'EXECUTE')
    or not has_function_privilege('authenticated', f.oid, 'EXECUTE') then raise exception 'Incorrect RPC execution grants'; end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('UPDATE','ALL')) then
    raise exception 'Direct update policy remains';
  end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Profile SELECT isolation failed'; end if;
  begin
    update public.profiles set telegram_chat_id=999 where id=auth.uid();
    raise exception 'Direct own binding update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set telegram_chat_id=999 where id='00000000-0000-4000-8000-000000000002';
    raise exception 'Cross-user binding update unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_telegram_connection_token('synthetic-token-a', 999, 999, 'attacker');
    raise exception 'Authenticated token consumption unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.disconnect_telegram('00000000-0000-4000-8000-000000000002'::uuid);
    raise exception 'RPC accepts an arbitrary target';
  exception when undefined_function then null; end;
  if not public.disconnect_telegram() or not public.disconnect_telegram() then raise exception 'Caller disconnect/idempotency failed'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.profiles where id='00000000-0000-4000-8000-000000000001'
    and (telegram_chat_id is not null or telegram_user_id is not null or telegram_username is not null or telegram_connected_at is not null)) then
    raise exception 'Caller binding not cleared';
  end if;
  if exists(select id,created_at from public.profiles except select id,created_at from preserved_profiles) then raise exception 'Unrelated profile fields altered'; end if;
  if exists(select * from public.profiles where id='00000000-0000-4000-8000-000000000002'
    except select * from preserved_profiles where id='00000000-0000-4000-8000-000000000002') then raise exception 'Other user changed'; end if;
end $$;

set local role anon;
do $$ begin
  begin perform public.disconnect_telegram(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
  begin update public.profiles set telegram_chat_id=999; raise exception 'Anonymous UPDATE allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin perform public.disconnect_telegram(); raise exception 'Missing caller identity allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  if not public.disconnect_telegram() then raise exception 'Second user cannot disconnect'; end if;
end $$;
reset role;

insert into public.telegram_connection_tokens(user_id, token_hash, expires_at) values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-reconnect', now() + interval '10 minutes'),
  ('00000000-0000-4000-8000-000000000001', 'synthetic-expired', now() - interval '1 minute');
set local role service_role;
do $$ begin
  if public.consume_telegram_connection_token('synthetic-expired', 999, 999, 'invalid') then raise exception 'Expired token accepted'; end if;
  if not public.consume_telegram_connection_token('synthetic-reconnect', 103, 203, 'reconnected') then raise exception 'Verified bot reconnect failed'; end if;
  if public.consume_telegram_connection_token('synthetic-reconnect', 999, 999, 'replay') then raise exception 'Token replay accepted'; end if;
end $$;
reset role;
do $$ begin
  if (select telegram_chat_id from public.profiles where id='00000000-0000-4000-8000-000000000001') is distinct from 203::bigint then
    raise exception 'Verified binding not stored'; end if;
  if (select telegram_chat_id from public.profiles where id='00000000-0000-4000-8000-000000000002') is not null then
    raise exception 'Other user binding changed during reconnect'; end if;
end $$;
rollback;
select 'PASS: staged migrations, preserved connections, grants/RLS, caller-only disconnect, bot reconnect, expired/replayed token rejection' as result;
