import { describe, expect, it, vi } from "vitest";
import type { Market } from "@/lib/types";
import {
  MarketHistoryRecorder,
  createSupabaseMarketHistoryStore,
  type MarketHistoryRow,
  type MarketHistoryStore,
} from "./history";

const NOW = Date.parse("2026-09-30T12:02:00.000Z");

function activeMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: "101",
    name: "Active market",
    yesCoin: "#1010",
    noCoin: "#1011",
    yesPrice: 0.62,
    noPrice: 0.38,
    closesAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

class MemoryStore implements MarketHistoryStore {
  rows = new Map<string, MarketHistoryRow>();
  insertCalls = 0;
  cutoffs: string[] = [];

  async insertBucket(rows: MarketHistoryRow[]) {
    this.insertCalls += 1;
    for (const row of rows) {
      const key = `${row.market_id}:${row.bucket_at}`;
      if (!this.rows.has(key)) this.rows.set(key, row);
    }
  }

  async deleteBefore(cutoff: string) {
    this.cutoffs.push(cutoff);
    for (const [key, row] of this.rows) {
      if (row.bucket_at < cutoff) this.rows.delete(key);
    }
  }
}

const noRetry = { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, sleep: async () => {} };

describe("market history recorder", () => {
  it("writes one valid active YES midpoint into its five-minute bucket", async () => {
    const store = new MemoryStore();
    const recorder = new MarketHistoryRecorder(store, async () => [
      activeMarket(),
      activeMarket({ id: "closed", closesAt: new Date(NOW).toISOString() }),
      activeMarket({ id: "missing", yesPrice: null }),
    ], { now: () => NOW, retry: noRetry });

    await expect(recorder.record()).resolves.toEqual({ inserted: 1, cleaned: true });
    expect([...store.rows.values()]).toEqual([{
      market_id: "101",
      bucket_at: "2026-09-30T12:00:00.000Z",
      observed_at: "2026-09-30T12:02:00.000Z",
      yes_probability: 0.62,
    }]);
  });

  it("coalesces concurrent recorder calls", async () => {
    const store = new MemoryStore();
    const loadMarkets = vi.fn(async () => [activeMarket()]);
    const recorder = new MarketHistoryRecorder(store, loadMarkets, { now: () => NOW, retry: noRetry });

    await Promise.all([recorder.record(), recorder.record(), recorder.record()]);
    expect(loadMarkets).toHaveBeenCalledTimes(1);
    expect(store.insertCalls).toBe(1);
  });

  it("remains idempotent across worker restarts in the same bucket", async () => {
    const store = new MemoryStore();
    const first = new MarketHistoryRecorder(store, async () => [activeMarket({ yesPrice: 0.6 })], {
      now: () => NOW,
      retry: noRetry,
    });
    const restarted = new MarketHistoryRecorder(store, async () => [activeMarket({ yesPrice: 0.7 })], {
      now: () => NOW + 60_000,
      retry: noRetry,
    });

    await first.record();
    await restarted.record();
    expect(store.rows.size).toBe(1);
    expect([...store.rows.values()][0].yes_probability).toBe(0.6);
  });

  it("prunes at the retention boundary no more than hourly", async () => {
    let now = NOW;
    const store = new MemoryStore();
    const recorder = new MarketHistoryRecorder(store, async () => [activeMarket()], {
      now: () => now,
      retry: noRetry,
      retentionMs: 48 * 60 * 60_000,
    });

    await recorder.record();
    now += 5 * 60_000;
    await recorder.record();
    now += 60 * 60_000;
    await recorder.record();

    expect(store.cutoffs).toEqual([
      "2026-09-28T12:02:00.000Z",
      "2026-09-28T13:07:00.000Z",
    ]);
  });

  it("configures Supabase inserts as duplicate-safe upserts", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    const store = createSupabaseMarketHistoryStore({ from } as never);
    const rows: MarketHistoryRow[] = [{
      market_id: "101",
      bucket_at: "2026-09-30T12:00:00.000Z",
      observed_at: "2026-09-30T12:02:00.000Z",
      yes_probability: 0.62,
    }];

    await store.insertBucket(rows);
    expect(from).toHaveBeenCalledWith("market_probability_observations");
    expect(upsert).toHaveBeenCalledWith(rows, {
      onConflict: "market_id,bucket_at",
      ignoreDuplicates: true,
    });
  });
});
