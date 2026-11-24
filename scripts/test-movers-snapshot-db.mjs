// Disposable PostgreSQL only. No hosted URLs, credentials, or production access.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const name = `oddsup-movers-snapshot-${randomUUID().slice(0, 8)}`;
const docker = (args, input) => execFileSync("docker", args, {
  input,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
}).trim();
const psqlArgs = ["exec", "-i", name, "psql", "-h", "127.0.0.1", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (text) => docker(psqlArgs, text);
const expectError = (text) => assert.throws(() => sql(text));
let created = false;

try {
  docker(["run", "--detach", "--name", name, "--network", "none", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
  created = true;
  for (let attempt = 0; ; attempt += 1) {
    try { sql("select 1;"); break; }
    catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;`);
  for (const migration of [
    "20260930000000_market_probability_history.sql",
    "20261123000000_movers_durable_snapshot.sql",
  ]) {
    sql(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  }

  for (const role of ["anon", "authenticated"]) {
    for (const table of ["market_current_snapshot_batches", "market_current_snapshot_markets"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal(sql(`select has_table_privilege('${role}','public.${table}','${privilege}');`), "f");
      }
    }
    assert.equal(sql(`select has_function_privilege('${role}','public.publish_market_current_snapshot(timestamptz,jsonb)','EXECUTE');`), "f");
    assert.equal(sql(`select has_function_privilege('${role}','public.read_market_movers_fallback(text,integer)','EXECUTE');`), "t");
  }
  expectError("set role anon; select * from public.market_current_snapshot_batches;");

  sql(`insert into public.market_probability_observations(market_id,bucket_at,observed_at,yes_probability)
    select '101', date_bin('5 minutes', clock_timestamp()-make_interval(mins=>minutes), '2000-01-01'::timestamptz),
      clock_timestamp()-make_interval(mins=>minutes), probability
    from (values (5,.5::numeric),(60,.4::numeric),(1440,.3::numeric)) as history(minutes,probability);`);

  const payload = JSON.stringify([{
    market_id: "101",
    market_name: "Will the durable snapshot work?",
    category: "Sports",
    venue: "out",
    protocol_native: false,
    closes_at: null,
    yes_probability: 0.6,
    no_probability: 0.4,
  }]).replaceAll("'", "''");
  assert.equal(sql(`set role service_role; select public.publish_market_current_snapshot(clock_timestamp(),'${payload}'::jsonb);`), "1");

  for (const window of ["5m", "1h", "24h"]) {
    const result = sql(`set role anon; select market_id||':'||historical_yes_probability
      from public.read_market_movers_fallback('${window}',600);`);
    assert.match(result, /^101:/);
  }

  const originalBatch = sql("select batch_id from public.market_current_snapshot_batches order by observed_at desc limit 1;");
  const invalidPayload = JSON.stringify([
    JSON.parse(payload.replaceAll("''", "'"))[0],
    JSON.parse(payload.replaceAll("''", "'"))[0],
  ]).replaceAll("'", "''");
  expectError(`set role service_role; select public.publish_market_current_snapshot(clock_timestamp(),'${invalidPayload}'::jsonb);`);
  assert.equal(sql("select batch_id from public.market_current_snapshot_batches order by observed_at desc limit 1;"), originalBatch);
  assert.equal(sql("select count(*) from public.market_current_snapshot_markets;"), "1");

  sql("update public.market_current_snapshot_batches set observed_at=clock_timestamp()-interval '11 minutes';");
  assert.equal(sql("set role anon; select count(*) from public.read_market_movers_fallback('5m',600);"), "0");
  expectError("set role anon; select * from public.read_market_movers_fallback('invalid',600);");

  console.log("MOVERS DURABLE SNAPSHOT DATABASE MATRIX PASSED");
} finally {
  if (created) docker(["rm", "--force", "--volumes", name]);
  console.log("Disposable test container removed; production untouched.");
}
