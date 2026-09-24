import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({
  options: null as null | { revalidate: number; tags: string[] },
  returnStaleOnExpiry: false,
  reads: 0,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>,
    _keys: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    cacheState.options = options;
    let cached: unknown;
    let expiresAt = 0;
    let inFlight: Promise<unknown> | null = null;
    return async () => {
      cacheState.reads += 1;
      if (cached !== undefined && (Date.now() <= expiresAt || cacheState.returnStaleOnExpiry)) {
        return cached;
      }
      if (!inFlight) {
        inFlight = loader()
          .then((value) => {
            cached = value;
            expiresAt = Date.now() + options.revalidate * 1_000;
            return value;
          })
          .finally(() => { inFlight = null; });
      }
      return inFlight;
    };
  },
}));

const metadata = {
  outcomes: [{
    outcome: 1209,
    name: "template:priceTouch",
    description: "perp:HYPE|target:100|time:20261001-0000",
    status: "active",
    sideSpecs: [{ name: "YES" }, { name: "NO" }],
  }],
  questions: [],
};
const mids = { "#12090": "0.34", "#12091": "0.66" };

function successfulFetch() {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { type: string };
    const value = body.type === "outcomeMeta" ? metadata : mids;
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

async function importClient() {
  return import("./client");
}

describe("public HIP-4 market snapshot cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));
    cacheState.options = null;
    cacheState.returnStaleOnExpiry = false;
    cacheState.reads = 0;
    vi.stubGlobal("fetch", successfulFetch());
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reuses one public snapshot for five seconds", async () => {
    const { getMarketsWithFallback, MARKET_CACHE_SECONDS } = await importClient();

    const first = await getMarketsWithFallback();
    vi.advanceTimersByTime(4_999);
    const second = await getMarketsWithFallback();

    expect(first).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(MARKET_CACHE_SECONDS).toBe(5);
    expect(cacheState.options).toEqual({
      revalidate: 5,
      tags: ["public-hip4-markets"],
    });
  });

  it("refreshes the snapshot after expiry", async () => {
    const { getMarketsWithFallback } = await importClient();
    const first = await getMarketsWithFallback();
    vi.advanceTimersByTime(5_001);
    const second = await getMarketsWithFallback();

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(Date.parse(second.fetchedAt)).toBeGreaterThan(Date.parse(first.fetchedAt));
  });

  it("coalesces concurrent cache misses", async () => {
    const { getMarketsWithFallback } = await importClient();
    const results = await Promise.all([
      getMarketsWithFallback(),
      getMarketsWithFallback(),
      getMarketsWithFallback(),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.source === "live")).toBe(true);
  });

  it("does not present an expired snapshot as live while it revalidates", async () => {
    const { getMarketsWithFallback } = await importClient();
    const live = await getMarketsWithFallback();
    expect(live.source).toBe("live");

    vi.advanceTimersByTime(5_001);
    cacheState.returnStaleOnExpiry = true;
    const stale = await getMarketsWithFallback();
    const repeatedStale = await getMarketsWithFallback();
    expect(stale.source).toBe("stale");
    expect(repeatedStale.source).toBe("stale");
    expect(stale.markets).toEqual(live.markets);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cacheState.reads).toBe(2);

    vi.advanceTimersByTime(10_001);
    await getMarketsWithFallback();
    expect(cacheState.reads).toBe(3);
  });

  it("uses preview data when the initial upstream request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    const { getMarketsWithFallback } = await importClient();

    const fallback = await getMarketsWithFallback();
    expect(fallback.source).toBe("preview");
    expect(fallback.markets).toHaveLength(4);
  });

  it("caches only public market fields", async () => {
    const { getMarketsWithFallback } = await importClient();
    const result = await getMarketsWithFallback();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("user_id");
    expect(serialized).not.toContain("telegram");
    expect(serialized).not.toContain("refresh_token");
    expect(result.markets[0]).toMatchObject({ id: "1209", yesPrice: 0.34, noPrice: 0.66 });
  });
});
