import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const restriction = readFileSync(new URL("../supabase/migrations/20261016000100_protect_telegram_profile_binding.sql", import.meta.url), "utf8");
const rpc = readFileSync(new URL("../supabase/migrations/20261016000000_telegram_disconnect_rpc.sql", import.meta.url), "utf8");
const sql = rpc + restriction;
const initial = readFileSync(new URL("../supabase/migrations/20260912000000_initial_schema.sql", import.meta.url), "utf8");

// These are source-level guards, NOT a substitute for executed PostgreSQL/RLS tests.
describe("Telegram permission migration static guards", () => {
  it("revokes both table and column updates and removes the permissive own-row update policy", () => {
    expect(sql).toContain("revoke update on table public.profiles from public, anon, authenticated;");
    expect(sql).toMatch(/revoke update \(id, telegram_user_id, telegram_chat_id, telegram_username,\s+telegram_connected_at, created_at\)\s+on table public.profiles from public, anon, authenticated;/);
    expect(sql).toContain('drop policy if exists "profiles_update_own" on public.profiles;');
    expect(sql).not.toMatch(/grant\s+update[\s\S]*?to\s+(?:anon|authenticated|public)\s*;/i);
  });

  it("exposes only a caller-scoped, no-argument disconnect with safe definer privileges", () => {
    expect(sql).toContain("function public.disconnect_telegram()");
    expect(sql).toMatch(/security definer\s+set search_path = ''/);
    expect(sql).toContain("caller_id uuid := auth.uid();");
    expect(sql).toContain("if caller_id is null then");
    expect(sql).toContain("errcode = '42501'");
    expect(sql).toContain("where id = caller_id;");
    expect(sql).toContain("alter function public.disconnect_telegram() owner to postgres;");
    expect(sql).toContain("revoke all on function public.disconnect_telegram() from public, anon, authenticated, service_role;");
    expect(sql).toContain("grant execute on function public.disconnect_telegram() to authenticated;");
    expect(sql).not.toMatch(/\bexecute\s+(?:format|p_|')/i);
  });

  it("clears only Telegram fields on invocation and performs no migration-time profile writes", () => {
    const [before, body, after] = sql.split("$$");
    expect(before + after).not.toMatch(/\b(?:update|delete from|insert into) public\.profiles\b/i);
    expect(body).toMatch(/set telegram_user_id = null,\s+telegram_chat_id = null,\s+telegram_username = null,\s+telegram_connected_at = null\s+where id = caller_id;/);
    expect(body).not.toMatch(/set\s+(?:id|created_at)\s*=/i);
    expect(rpc.trim()).toMatch(/^begin;[\s\S]*commit;$/);
    expect(restriction.trim()).toMatch(/^begin;[\s\S]*commit;$/);
  });

  it("preserves service-role token binding and read ownership without rewriting bot logic", () => {
    expect(sql).toContain("grant select, update on table public.profiles to service_role;");
    expect(sql).not.toContain("drop policy if exists \"profiles_select_own\"");
    expect(sql).not.toContain("create or replace function public.consume_telegram_connection_token");
    expect(initial).toContain("revoke all on function public.consume_telegram_connection_token(text,bigint,bigint,text) from public, anon, authenticated;");
    expect(initial).toContain("grant execute on function public.consume_telegram_connection_token(text,bigint,bigint,text) to service_role;");
  });
});
