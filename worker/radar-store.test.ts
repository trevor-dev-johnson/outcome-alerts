import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRadarStore } from "./radar";

describe("Radar history read bounds", () => {
  it.each([299, 300, 301, 329, 600, 900])("batches %i IDs and never exceeds two in-flight reads", async (count) => {
    const ids = Array.from({ length: count }, (_, i) => String(i));
    let active = 0, peak = 0;
    const batches: string[][] = [];
    const read = async (batch: string[]) => {
      active++; peak = Math.max(peak, active); batches.push(batch);
      await new Promise((resolve) => setTimeout(resolve, 1)); active--;
      return { data: batch.map((market_id) => ({ market_id })), error: null };
    };
    let pending: string[] = [];
    const client = {
      rpc: vi.fn((_name, args) => ({ abortSignal: () => read(args.p_market_ids) })),
      from: vi.fn(() => ({ select: () => ({ in: (_field: string, batch: string[]) => {
        pending = batch;
        return { eq: () => { const captured = pending; return { abortSignal: () => read(captured) }; } };
      } }) })),
    };
    const result = await createRadarStore(client as unknown as SupabaseClient).observations(ids, "bucket", ["5m", "1h", "24h"], Date.now());
    expect(peak).toBeLessThanOrEqual(2);
    expect(batches.every((b) => b.length <= 300)).toBe(true);
    expect(client.rpc).toHaveBeenCalledTimes(Math.ceil(count / 300) * 3);
    for (const rows of [result.current, ...Object.values(result.history)])
      expect(rows!.map((r) => r.market_id).sort()).toEqual([...ids].sort());
  });
  it("rejects oversized universes before a query", async () => {
    const client = { rpc: vi.fn(), from: vi.fn() };
    await expect(createRadarStore(client as unknown as SupabaseClient).observations(Array(901).fill("1"), "bucket", ["5m"], Date.now())).rejects.toThrow("radar_market_limit");
    expect(client.from).not.toHaveBeenCalled();
  });
  it("detects server-side subscription truncation rather than processing a partial audience", async () => {
    const result = { data: Array(1000).fill({}), error: null, count: 1001 };
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ abortSignal: async () => result }) }) }) }) }) };
    await expect(createRadarStore(client as unknown as SupabaseClient).subscriptions()).rejects.toThrow("radar_subscription_limit");
  });
});
