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

describe("HIP-4 market name normalization", () => {
  it("formats the active NFL total descriptor as a natural question", async () => {
    const { normalizeMarketName } = await importClient();
    const name = normalizeMarketName({
      outcome: 7048,
      name: "template:sportsTotal",
      description: "countedPlay:regulation time and any overtime|line:43.5|measure:points|officialSource:ESPN|participantA:Arizona Cardinals|participantB:New York Giants|resolutionDeadline:20261004-2300|scheduledStart:20261004-1700|sport:football",
    });

    expect(name).toBe("Will Arizona Cardinals vs New York Giants go over 43.5 total points?");
  });

  it("preserves existing crypto binary-price formatting", async () => {
    const { normalizeMarketName } = await importClient();
    expect(normalizeMarketName({
      outcome: 1209,
      name: "template:binaryPrice",
      description: "perp:BTC|threshold:100000|time:20261001-0000",
    })).toBe("Will BTC be above $100,000 on Oct 1, 2026?");
  });

  it("formats sports winner markets", async () => {
    const { normalizeMarketName } = await importClient();
    expect(normalizeMarketName({
      outcome: 6740,
      name: "template:sportsContestWinner",
      description: "participantA:Arizona Cardinals|participantB:New York Giants",
    })).toBe("Will Arizona Cardinals beat New York Giants?");
  });

  it("formats both legacy and current sports over-under templates", async () => {
    const { normalizeMarketName } = await importClient();
    const description = "participantA:Arizona Cardinals|participantB:New York Giants|line:43.5|measure:points";

    expect(normalizeMarketName({ outcome: 1, name: "template:sportsOverUnderMarket", description }))
      .toBe("Will Arizona Cardinals vs New York Giants go over 43.5 total points?");
    expect(normalizeMarketName({ outcome: 2, name: "template:sportsTotal", description }))
      .toBe("Will Arizona Cardinals vs New York Giants go over 43.5 total points?");
  });

  it("formats current sports spread and IPO market-cap templates", async () => {
    const { normalizeMarketName } = await importClient();

    expect(normalizeMarketName({
      outcome: 7046,
      name: "template:sportsSpread",
      description: "measure:points|participantA:Arizona Cardinals|participantB:New York Giants|spread:-2.5",
    })).toBe("Will Arizona Cardinals cover a -2.5-point spread vs New York Giants?");
    expect(normalizeMarketName({
      outcome: 7360,
      name: "template:companyIpoFirstDayMarketCap",
      description: "company:Anthropic|listingDeadline:20261231-2359|marketCapThresholdB:2000",
    })).toBe("Will Anthropic's first-day market cap be above $2,000B?");
  });

  it("never exposes an unknown raw descriptor", async () => {
    const { normalizeMarketName } = await importClient();
    const name = normalizeMarketName({
      outcome: 9999,
      name: "template:newUnknownMarket",
      description: "participantA:Alpha|mysteryValue:Beta|resolutionDeadline:20270101-0000",
    });

    expect(name).toBe("Outcome market #9999");
    expect(name).not.toContain("participantA:");
    expect(name).not.toContain("|");
  });

  it("leaves a plain human-readable upstream name unchanged", async () => {
    const { normalizeMarketName } = await importClient();
    expect(normalizeMarketName({ outcome: 88, name: "Will the launch happen this year?" }))
      .toBe("Will the launch happen this year?");
  });
});
