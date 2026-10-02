import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260930000000_market_probability_history.sql", import.meta.url),
  "utf8",
);

describe("Movers history migration security", () => {
  it("denies direct table access to public client roles", () => {
    expect(migration).toMatch(
      /revoke all\s+on public\.market_probability_observations\s+from public, anon, authenticated;/i,
    );
    expect(migration).not.toMatch(
      /grant select on public\.market_probability_observations to (?:anon|authenticated)/i,
    );
    expect(migration).not.toMatch(
      /create policy[\s\S]*market_probability_observations[\s\S]*to anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant all on public\.market_probability_observations to service_role;/i,
    );
  });

  it("exposes only the hardened bounded RPC", () => {
    expect(migration).toMatch(/security definer\s+set search_path = ''/i);
    expect(migration).toMatch(
      /alter function public\.closest_market_probability_observations\(text\[\], timestamptz, integer\)\s+owner to postgres;/i,
    );
    expect(migration).toMatch(
      /revoke all on function public\.closest_market_probability_observations\(text\[\], timestamptz, integer\)\s+from public, anon, authenticated;/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.closest_market_probability_observations\(text\[\], timestamptz, integer\)\s+to anon, authenticated, service_role;/i,
    );
    expect(migration).toContain("cardinality(p_market_ids) > 300");
    expect(migration).toContain("p_tolerance_seconds > 600");
    expect(migration).toContain("from public.market_probability_observations as observation");
    expect(migration).not.toMatch(/\bexecute\s+(?:format|p_)/i);
  });
});
