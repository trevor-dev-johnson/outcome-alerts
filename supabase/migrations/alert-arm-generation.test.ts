import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("./20261017000000_alert_arm_generation.sql", import.meta.url),
  "utf8",
).toLowerCase();

describe("alert arm generation migration", () => {
  it("adds a monotonic alert generation and clears claims whenever it advances", () => {
    expect(sql).toContain("add column arm_generation bigint not null default 1");
    expect(sql).toContain("new.arm_generation := old.arm_generation + 1");
    expect(sql).toContain("after update of arm_generation on public.alerts");
    expect(sql).toContain("delete from public.alert_delivery_claims where alert_id = new.id");
  });

  it("binds claims and completion to the expected generation", () => {
    expect(sql).toContain("function public.claim_alert_delivery_for_generation");
    expect(sql).toContain("alert.arm_generation = p_arm_generation");
    expect(sql).toContain("function public.complete_alert_delivery_for_generation");
    expect(sql).toMatch(/status = 'active'[\s\S]*and arm_generation = p_arm_generation/);
  });

  it("keeps the new RPCs service-role only with fixed search paths", () => {
    expect(sql.match(/security definer/g)).toHaveLength(6);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(6);
    expect(sql).toContain("owner to postgres");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });

  it("retains the legacy service-only RPCs for the controlled worker rollout", () => {
    expect(sql).not.toMatch(/drop function[^;]*claim_alert_delivery\s*\(/);
    expect(sql).not.toMatch(/drop function[^;]*complete_alert_delivery\s*\(/);
    expect(sql).toContain("return public.claim_alert_delivery_for_generation(");
    expect(sql).toContain("return public.complete_alert_delivery_for_generation(");
  });
});
