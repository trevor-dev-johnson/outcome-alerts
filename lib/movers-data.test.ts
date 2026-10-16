import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMarketsWithFallback: vi.fn(),
  hasSupabaseEnv: vi.fn(() => true),
  createPublicClient: vi.fn(),
}));

const cacheState = vi.hoisted(() => ({
  entries: new Map<string, { value?: unknown; expiresAt: number; inFlight?: Promise<unknown> }>(),
  options: [] as Array<{ revalidate: number; tags: string[] }>,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>,
    keys: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    cacheState.options.push(options);
    const key = keys.join(":");
    return async () => {
      const entry = cacheState.entries.get(key);
      if (entry?.value !== undefined && Date.now() <= entry.expiresAt) return entry.value;
      if (entry?.inFlight) return entry.inFlight;

      const inFlight = loader()
        .then((value) => {
          cacheState.entries.set(key, {
            value,
            expiresAt: Date.now() + options.revalidate * 1_000,
          });
          return value;
        })
        .catch((error) => {
          cacheState.entries.delete(key);
          throw error;
        });
      cacheState.entries.set(key, { expiresAt: 0, inFlight });
      return inFlight;
    };
  },
}));

vi.mock("@/lib/hyperliquid/client", () => ({
  getMarketsWithFallback: mocks.getMarketsWithFallback,
}));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: mocks.hasSupabaseEnv }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: mocks.createPublicClient }));

import {
  getMoversSnapshot,
  MOVERS_HISTORY_CACHE_SECONDS,
  MOVERS_HISTORY_MAX_CONCURRENCY,
} from "./movers-data";
import { MAX_MOVER_TOTAL_MARKET_IDS, type MoverWindow } from "./movers";

const FETCHED_AT = "2026-09-30T12:00:00.000Z";

function marketSnapshot(source: "live" | "stale" | "preview" = "live") {
  return {
    source,
    fetchedAt: FETCHED_AT,
    markets: [{
      id: "101",
      name: "Will it happen?",
      yesCoin: "#1010",
      noCoin: "#1011",
      yesPrice: 0.6,
      noPrice: 0.4,
      closesAt: "2026-10-01T00:00:00.000Z",
    }],
  };
}

function marketSnapshotWithCount(count: number) {
  return {
    ...marketSnapshot(),
    markets: Array.from({ length: count }, (_, index) => {
      const id = String(index + 1).padStart(4, "0");
      return {
        ...marketSnapshot().markets[0],
        id,
        name: `Market ${id}`,
        yesPrice: index === count - 1 ? 0.99 : 0.6,
      };
    }),
  };
}

function historyForRpcArgs(args: {
  p_market_ids: string[];
  p_target_at: string;
}) {
  return args.p_market_ids.map((marketId) => ({
    market_id: marketId,
    bucket_at: args.p_target_at,
    observed_at: args.p_target_at,
    yes_probability: marketId === "0329" ? 0.1 : 0.5,
  }));
}

describe("public Movers data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FETCHED_AT));
    cacheState.entries.clear();
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshot());
  });

  it("reads only shared market history and never user-owned tables", async () => {
    const data = [{
      market_id: "101",
      bucket_at: "2026-09-30T11:00:00.000Z",
      observed_at: "2026-09-30T11:00:00.000Z",
      yes_probability: 0.5,
      user_id: "must-not-enter-cache-output",
    }];
    const rpc = vi.fn(async () => ({ data, error: null }));
    const from = vi.fn();
    mocks.createPublicClient.mockReturnValue({ rpc, from });

    const result = await getMoversSnapshot("1h", Date.parse(FETCHED_AT));

    expect(result.state).toBe("live");
    expect(result.movers[0].deltaPoints).toBe(10);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("closest_market_probability_observations", {
      p_market_ids: ["101"],
      p_target_at: "2026-09-30T11:00:00.000Z",
      p_tolerance_seconds: 300,
    });
    expect(JSON.stringify(result)).not.toMatch(/user_id|email|telegram|profile|alert/i);
  });

  it("reports insufficient history without inventing a comparison", async () => {
    mocks.createPublicClient.mockReturnValue({ rpc: vi.fn(async () => ({ data: [], error: null })) });
    const result = await getMoversSnapshot("24h", Date.parse(FETCHED_AT));
    expect(result).toMatchObject({
      state: "collecting",
      movers: [],
      eligibleMarketCount: 1,
      insufficientHistoryCount: 1,
    });
  });

  it("does not calculate from preview or expired current data", async () => {
    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshot("preview"));
    const result = await getMoversSnapshot("5m", Date.parse(FETCHED_AT));
    expect(result).toMatchObject({ state: "upstream-error", movers: [] });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();

    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshot("stale"));
    const stale = await getMoversSnapshot("5m", Date.parse(FETCHED_AT) + 61_000);
    expect(stale).toMatchObject({ state: "stale", movers: [] });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it("labels a recent stale-cache comparison as updating, never live", async () => {
    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshot("stale"));
    const data = [{
      market_id: "101",
      bucket_at: "2026-09-30T11:55:00.000Z",
      observed_at: "2026-09-30T11:55:00.000Z",
      yes_probability: 0.5,
    }];
    mocks.createPublicClient.mockReturnValue({ rpc: vi.fn(async () => ({ data, error: null })) });
    const result = await getMoversSnapshot("5m", Date.parse(FETCHED_AT) + 20_000);
    expect(result).toMatchObject({ state: "updating", movers: [{ deltaPoints: 10 }] });
  });

  it("fails closed when shared-history storage is unavailable", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(false);
    const result = await getMoversSnapshot("1h", Date.parse(FETCHED_AT));
    expect(result).toMatchObject({ state: "unavailable", movers: [] });
    expect(mocks.createPublicClient).not.toHaveBeenCalled();
  });

  it("fails closed before RPC when the active universe exceeds the bounded total", async () => {
    mocks.getMarketsWithFallback.mockResolvedValue(
      marketSnapshotWithCount(MAX_MOVER_TOTAL_MARKET_IDS + 1),
    );
    const rpc = vi.fn();
    mocks.createPublicClient.mockReturnValue({ rpc });

    const result = await getMoversSnapshot("1h", Date.parse(FETCHED_AT));

    expect(result).toMatchObject({
      state: "unavailable",
      eligibleMarketCount: MAX_MOVER_TOTAL_MARKET_IDS + 1,
      insufficientHistoryCount: MAX_MOVER_TOTAL_MARKET_IDS + 1,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [299, [299]],
    [300, [300]],
    [301, [300, 1]],
    [329, [300, 29]],
    [600, [300, 300]],
  ] as const)("batches %i markets within the existing RPC bound", async (count, batchSizes) => {
    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshotWithCount(count));
    const rpc = vi.fn(async (_name: string, args: {
      p_market_ids: string[];
      p_target_at: string;
    }) => ({ data: historyForRpcArgs(args), error: null }));
    mocks.createPublicClient.mockReturnValue({ rpc });

    const result = await getMoversSnapshot("1h", Date.parse(FETCHED_AT));
    const calls = rpc.mock.calls as unknown as Array<[string, { p_market_ids: string[] }]>;
    const requestedIds = calls.flatMap((call) => call[1].p_market_ids);

    expect(calls.map((call) => call[1].p_market_ids.length)).toEqual(batchSizes);
    expect(requestedIds).toEqual([...requestedIds].sort((a, b) => a.localeCompare(b)));
    expect(new Set(requestedIds).size).toBe(count);
    expect(result).toMatchObject({
      state: "live",
      eligibleMarketCount: count,
      insufficientHistoryCount: 0,
    });
    expect(result.movers).toHaveLength(count);
    expect(new Set(result.movers.map((mover) => mover.marketId)).size).toBe(count);
  });

  it.each(["5m", "1h", "24h"] as const)(
    "calculates globally ranked %s Movers across a 600-market batched universe",
    async (window: MoverWindow) => {
      mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshotWithCount(600));
      const rpc = vi.fn(async (_name: string, args: {
        p_market_ids: string[];
        p_target_at: string;
      }) => ({ data: historyForRpcArgs(args), error: null }));
      mocks.createPublicClient.mockReturnValue({ rpc });

      const result = await getMoversSnapshot(window, Date.parse(FETCHED_AT));

      expect(result.state).toBe("live");
      expect(result.movers).toHaveLength(600);
      expect(result.movers[0]).toMatchObject({ marketId: "0329", window });
      expect(new Set(result.movers.map((mover) => mover.marketId)).size).toBe(600);
    },
  );

  it("fails the whole snapshot closed when any required batch fails", async () => {
    mocks.getMarketsWithFallback.mockResolvedValue(marketSnapshotWithCount(329));
    let call = 0;
    const rpc = vi.fn(async (_name: string, args: {
      p_market_ids: string[];
      p_target_at: string;
    }) => {
      call += 1;
      return call === 2
        ? { data: null, error: { code: "PGRST500" } }
        : { data: historyForRpcArgs(args), error: null };
    });
    mocks.createPublicClient.mockReturnValue({ rpc });

    const result = await getMoversSnapshot("1h", Date.parse(FETCHED_AT));

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      state: "unavailable",
      movers: [],
      eligibleMarketCount: 329,
      insufficientHistoryCount: 329,
    });
  });

  it("bounds concurrent RPC batches", async () => {
    mocks.getMarketsWithFallback.mockResolvedValue(
      marketSnapshotWithCount(MAX_MOVER_TOTAL_MARKET_IDS),
    );
    let active = 0;
    let maxActive = 0;
    const rpc = vi.fn(async (_name: string, args: {
      p_market_ids: string[];
      p_target_at: string;
    }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { data: historyForRpcArgs(args), error: null };
    });
    mocks.createPublicClient.mockReturnValue({ rpc });

    await getMoversSnapshot("1h", Date.parse(FETCHED_AT));

    expect(MOVERS_HISTORY_MAX_CONCURRENCY).toBe(2);
    expect(maxActive).toBeLessThanOrEqual(MOVERS_HISTORY_MAX_CONCURRENCY);
  });

  it("reuses the shared history result for repeated requests in the same window", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    mocks.createPublicClient.mockReturnValue({ rpc });

    await getMoversSnapshot("5m", Date.now());
    vi.advanceTimersByTime(20_000);
    await getMoversSnapshot("5m", Date.now());

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(MOVERS_HISTORY_CACHE_SECONDS).toBe(25);
    expect(cacheState.options).toEqual([
      { revalidate: 25, tags: ["public-hip4-movers-history"] },
      { revalidate: 25, tags: ["public-hip4-movers-history"] },
      { revalidate: 25, tags: ["public-hip4-movers-history"] },
    ]);
  });

  it("keeps each supported Movers window in an independent cache entry", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    mocks.createPublicClient.mockReturnValue({ rpc });

    await getMoversSnapshot("5m", Date.now());
    await getMoversSnapshot("1h", Date.now());
    await getMoversSnapshot("24h", Date.now());
    await getMoversSnapshot("1h", Date.now());

    expect(rpc).toHaveBeenCalledTimes(3);
    const calls = rpc.mock.calls as unknown as Array<[string, { p_target_at: string }]>;
    expect(calls.map((call) => call[1].p_target_at)).toEqual([
      "2026-09-30T11:55:00.000Z",
      "2026-09-30T11:00:00.000Z",
      "2026-09-29T12:00:00.000Z",
    ]);
  });

  it("performs a fresh history RPC after the cache expires", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    mocks.createPublicClient.mockReturnValue({ rpc });

    await getMoversSnapshot("5m", Date.now());
    vi.advanceTimersByTime(25_001);
    await getMoversSnapshot("5m", Date.now());

    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
