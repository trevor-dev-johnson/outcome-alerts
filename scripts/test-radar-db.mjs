// Disposable PostgreSQL only. No URLs, credentials, ports, or production access.
// Run: node scripts/test-radar-db.mjs (Docker Engine required).
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const name = `oddsup-radar-test-${randomUUID().slice(0, 8)}`;
const docker = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
// TCP inside the network-isolated container avoids the entrypoint's temporary
// socket-only initialization server, which shuts down before final startup.
const args = ["exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (text) => docker(args, text);
const asyncSql = (text) => new Promise((resolve, reject) => {
  const p = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  p.stdout.on("data", (s) => { out += s; }); p.stderr.on("data", (s) => { err += s; });
  p.on("error", reject); p.on("exit", (code) => code ? reject(new Error(err)) : resolve(out.trim()));
  p.stdin.end(text);
});
const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
const asUser = (id, query) => `set role authenticated; set request.jwt.claim.sub='${id}'; ${query}`;
const expectError = (query) => assert.throws(() => sql(query));
let created = false;
try {
  docker(["run", "--detach", "--name", name, "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
  created = true;
  for (let i = 0; ; i++) {
    try { sql("select 1;"); break; }
    catch (e) { if (i >= 30) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  for (const file of readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort()) {
    if (file.endsWith("_radar.sql")) {
      sql(`insert into auth.users values('${a}'),('${b}');
        update public.profiles set telegram_chat_id = 123 where id = '${a}';
        insert into public.alerts(user_id,market_id,market_name,outcome,operator,threshold) values('${a}','1','Existing alert','YES','above',.8);`);
    }
    sql(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  assert.equal(sql("select count(*) from public.alerts where arm_generation=1;"), "1");
  assert.equal(sql(`select telegram_chat_id from public.profiles where id='${a}';`), "123");
  console.log("PASS: all prior migrations + Radar; existing alert/profile preserved");

  const functions = sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_radar_subscription','manage_radar_subscription','claim_radar_event','begin_radar_delivery','finish_radar_delivery')
    and p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=""'];`);
  assert.equal(functions, "5");
  for (const role of ["anon", "authenticated"]) {
    assert.equal(sql(`select has_function_privilege('${role}','public.claim_radar_event(uuid,bigint,text,timestamptz,timestamptz,uuid)','EXECUTE');`), "f");
    for (const table of ["radar_accounts", "radar_subscriptions", "radar_events"])
      for (const privilege of ["INSERT", "UPDATE", "DELETE"])
        assert.equal(sql(`select has_table_privilege('${role}','public.${table}','${privilege}');`), "f");
  }
  assert.equal(sql("select has_table_privilege('authenticated','public.profiles','UPDATE');"), "f");
  assert.equal(sql("select has_function_privilege('service_role','public.begin_radar_delivery(uuid)','EXECUTE');"), "t");
  expectError("set role anon; select * from public.radar_subscriptions;");
  expectError(asUser(a, "select public.create_radar_subscription('category','NBA','5m',5,false);"));
  expectError(asUser(a, "select public.create_radar_subscription('category','NFLX','5m',5,true);"));
  for (const threshold of ["0", "101", "'NaN'", "null"])
    expectError(asUser(a, `select public.create_radar_subscription('market','1','5m',${threshold},true);`));
  console.log("PASS: security-definer ownership/search_path, execution privileges, consent/constraints, Stage C unchanged");

  const sub = sql(asUser(a, "select public.create_radar_subscription('market','1','5m',5,true);"));
  assert.equal(sql(asUser(b, "select count(*) from public.radar_subscriptions;")), "0");
  assert.equal(sql(asUser(b, `select public.manage_radar_subscription('${sub}','remove');`)), "f");
  expectError(asUser(a, `update public.radar_subscriptions set generation=99 where id='${sub}';`));
  // Use current database time; endpoints remain fresh throughout this test.
  sql(`insert into public.market_probability_observations(market_id,bucket_at,observed_at,yes_probability)
    select '1',date_bin('5 minutes',clock_timestamp()-make_interval(mins=>m),'2000-01-01'::timestamptz),clock_timestamp()-make_interval(mins=>m),p
    from (values(0,.6::numeric),(5,.4::numeric),(60,.8::numeric),(1440,.3::numeric)) v(m,p);`);
  const bucket = sql("select max(bucket_at) from public.market_probability_observations where market_id='1';");
  const baseline = sql("select bucket_at from public.market_probability_observations where market_id='1' order by bucket_at desc offset 1 limit 1;");
  const claim = (s, generation, id, base = baseline) => `select public.claim_radar_event('${s}',${generation},'1','${bucket}','${base}','${id}');`;
  assert.equal(sql(`set role service_role; ${claim(sub, 99, randomUUID())}`), "f");
  const e1 = randomUUID(), e2 = randomUUID();
  const results = await Promise.all([asyncSql(`set role service_role; ${claim(sub, 1, e1)}`), asyncSql(`set role service_role; ${claim(sub, 1, e2)}`)]);
  assert.deepEqual(results.sort(), ["f", "t"]);
  const event = sql("select id from public.radar_events limit 1;");
  const starts = await Promise.all([asyncSql(`set role service_role; select public.begin_radar_delivery('${event}');`), asyncSql(`set role service_role; select public.begin_radar_delivery('${event}');`)]);
  assert.deepEqual(starts.sort(), ["", "123"]);
  sql(`set role service_role; select public.finish_radar_delivery('${event}','sent'); select public.finish_radar_delivery('${event}','uncertain');`);
  assert.equal(sql(`select status from public.radar_events where id='${event}';`), "sent");
  assert.equal(sql(`set role service_role; ${claim(sub, 1, randomUUID())}`), "f");
  assert.equal(sql(asUser(b, "select count(*) from public.radar_events;")), "0");
  console.log("PASS: two-user isolation, concurrent claim/send gates, restart/replay suppression and idempotent completion");

  // Retention can delete a record between begin's initial lookup and its locks.
  const deleting = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const deleteReady = new Promise((resolve, reject) => {
    deleting.stdout.on("data", (data) => { if (String(data).includes("DELETE_LOCKED")) resolve(); });
    deleting.on("error", reject);
  });
  deleting.stdin.write(`begin; select 1 from public.radar_accounts where user_id='${a}' for update;
    delete from public.radar_events where id='${event}'; select 'DELETE_LOCKED';\n`);
  await deleteReady;
  const lateBegin = asyncSql(`set application_name='radar_test_begin'; set lock_timeout='5s'; set role service_role; select public.begin_radar_delivery('${event}');`);
  let beginWaiting = false;
  for (let i = 0; i < 100; i++) {
    if (sql("select count(*) from pg_stat_activity where application_name='radar_test_begin' and wait_event_type='Lock';") === "1") { beginWaiting = true; break; }
    await new Promise((r) => setTimeout(r, 20));
  }
  const deleteEnded = new Promise((resolve) => deleting.on("exit", resolve));
  deleting.stdin.end("commit;\n"); await deleteEnded;
  assert.equal(beginWaiting, true); assert.equal(await lateBegin, "");
  console.log("PASS: deterministic retention-versus-send gate race rejects missing event");

  // A held account lock makes the interleaving deterministic, not sleep-dependent.
  const blocker = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  const ready = new Promise((resolve, reject) => {
    blocker.stdout.on("data", (data) => { if (String(data).includes("LOCKED")) resolve(); });
    blocker.on("error", reject);
  });
  blocker.stdin.write(`begin; select 1 from public.radar_accounts where user_id='${a}' for update;
    ${asUser(a, `select public.manage_radar_subscription('${sub}','pause');`)} select 'LOCKED';\n`);
  await ready;
  const queued = asyncSql(`set application_name='radar_test_claim'; set lock_timeout='5s'; set role service_role; ${claim(sub, 1, randomUUID())}`);
  let waiting = false;
  for (let i = 0; i < 100; i++) {
    if (sql("select count(*) from pg_stat_activity where application_name='radar_test_claim' and wait_event_type='Lock';") === "1") { waiting = true; break; }
    await new Promise((r) => setTimeout(r, 20));
  }
  const ended = new Promise((resolve) => blocker.on("exit", resolve));
  blocker.stdin.end("commit;\n"); await ended;
  assert.equal(waiting, true); assert.equal(await queued, "f");
  assert.equal(sql(`select generation from public.radar_subscriptions where id='${sub}';`), "2");
  sql(asUser(a, `select public.manage_radar_subscription('${sub}','resume');`));
  assert.equal(sql(`select generation from public.radar_subscriptions where id='${sub}';`), "3");
  console.log("PASS: deterministic pause-versus-claim serialization and stale-generation rejection");

  // Synthetic isolated fixtures may be reset; no production resources are involved.
  sql("truncate public.radar_events;");
  for (const window of ["1h", "24h"]) {
    const s = sql(asUser(a, `select public.create_radar_subscription('market','1','${window}',5,true);`));
    const minutes = window === "1h" ? 60 : 1440;
    const base = sql(`select bucket_at from public.market_probability_observations where market_id='1' order by abs(extract(epoch from observed_at-(clock_timestamp()-interval '${minutes} minutes'))) limit 1;`);
    assert.equal(sql(`set role service_role; ${claim(s, 1, randomUUID(), base)}`), "t");
  }
  assert.equal(sql("select count(*) from public.radar_events where current_probability < baseline_probability;"), "1");
  assert.equal(sql("select count(*) from public.radar_events where current_probability > baseline_probability;"), "1");
  assert.equal(sql(`set role service_role; ${claim(sub, 3, randomUUID(), bucket)}`), "f");
  sql("truncate public.radar_events;");
  const pending = randomUUID();
  assert.equal(sql(`set role service_role; ${claim(sub, 3, pending)}`), "t");
  sql(asUser(a, `select public.manage_radar_subscription('${sub}','pause'); select public.manage_radar_subscription('${sub}','resume');`));
  assert.equal(sql(`set role service_role; select public.begin_radar_delivery('${pending}');`), "");
  assert.equal(sql(`select status from public.radar_events where id='${pending}';`), "cancelled");
  sql(asUser(a, `select public.manage_radar_subscription('${sub}','remove');`));
  const recreated = sql(asUser(a, "select public.create_radar_subscription('market','1','5m',5,true);"));
  assert.equal(sql(`set role service_role; ${claim(recreated, 1, randomUUID())}`), "f");
  console.log("PASS: real 5m/1h/24h history movement, positive/negative comparisons, gap rejection, pause/resume and remove/recreate cooldown");
  const other = sql(asUser(b, "select public.create_radar_subscription('market','1','5m',5,true);"));
  assert.equal(sql(`set role service_role; ${claim(other, 1, randomUUID())}`), "f");
  for (let i = 2; i <= 20; i++) sql(asUser(b, `select public.create_radar_subscription('market','${i}','5m',5,true);`));
  expectError(asUser(b, "select public.create_radar_subscription('market','21','5m',5,true);"));
  sql("truncate public.radar_events;");
  const rateSubs = [recreated];
  for (let i = 2; i <= 7; i++) {
    sql(`insert into public.market_probability_observations select '${i}',bucket_at,observed_at,yes_probability from public.market_probability_observations where market_id='1';`);
    rateSubs.push(sql(asUser(a, `select public.create_radar_subscription('market','${i}','5m',5,true);`)));
  }
  for (let i = 0; i < 7; i++) {
    const query = claim(rateSubs[i], 1, randomUUID()).replace(",'1',", `,'${i + 1}',`);
    assert.equal(sql(`set role service_role; ${query}`), i < 6 ? "t" : "f");
  }
  // Pausing a reserved event cancels its send; retained attempts still consume quota.
  const reserved = sql("select id from public.radar_events limit 1;");
  const reservedSub = sql(`select subscription_id from public.radar_events where id='${reserved}';`);
  sql(asUser(a, `select public.manage_radar_subscription('${reservedSub}','remove');`));
  assert.equal(sql(`set role service_role; select public.begin_radar_delivery('${reserved}');`), "");
  sql("update public.radar_events set created_at=clock_timestamp()-interval '61 minutes';");
  assert.equal(sql(`set role service_role; ${claim(rateSubs[6], 1, randomUUID()).replace(",'1',", ",'7',")}`), "t");
  sql("update public.radar_events set created_at=clock_timestamp()-interval '31 days'; set role service_role; delete from public.radar_events where created_at < clock_timestamp()-interval '30 days';");
  assert.equal(sql("select count(*) from public.radar_events;"), "0");
  // Missing endpoints cannot produce claims; null generations cannot bypass fencing.
  assert.equal(sql(`set role service_role; ${claim(rateSubs[6], null, randomUUID()).replace(",'1',", ",'7',")}`), "f");
  sql("delete from public.market_probability_observations where market_id='7';");
  assert.equal(sql(`set role service_role; ${claim(rateSubs[6], 1, randomUUID()).replace(",'1',", ",'7',")}`), "f");
  console.log("PASS: disconnected channel, 20-follow cap, six/hour cap, cooldown expiry, removal invalidation and retention");
  console.log("RADAR DATABASE MATRIX PASSED");
} finally {
  if (created) docker(["rm", "--force", "--volumes", name]);
  console.log("Disposable test container removed; production untouched.");
}
