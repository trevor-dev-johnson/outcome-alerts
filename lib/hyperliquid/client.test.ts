import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({
  options: null as null | { revalidate: number; tags: string[] },
  keys: [] as string[],
  returnStaleOnExpiry: false,
  reads: 0,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    loader: () => Promise<unknown>,
    keys: string[],
    options: { revalidate: number; tags: string[] },
  ) => {
    cacheState.options = options;
    cacheState.keys = keys;
    let cached: unknown;
    let expiresAt = 0;
    let inFlight: Promise<unknown> | null = null;
    return async () => {
      cacheState.reads += 1;
      if (cached !== undefined && Date.now() <= expiresAt) {
        return cached;
      }
      if (cached !== undefined && cacheState.returnStaleOnExpiry) {
        if (!inFlight) {
          inFlight = loader()
            .then((value) => {
              cached = value;
              expiresAt = Date.now() + options.revalidate * 1_000;
              return value;
            })
            .finally(() => { inFlight = null; });
        }
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
    cacheState.keys = [];
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
    expect(cacheState.keys).toEqual(["public-hip4-market-snapshot-v3"]);
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

  it("keeps refresh scheduling at five seconds while a 10-30 second snapshot remains usable", async () => {
    const { getMarketsWithFallback, MARKET_SNAPSHOT_MAX_AGE_MS } = await importClient();
    const live = await getMarketsWithFallback();
    expect(live.source).toBe("live");

    vi.advanceTimersByTime(5_001);
    cacheState.returnStaleOnExpiry = true;
    const usable = await getMarketsWithFallback();
    expect(usable.source).toBe("live");
    expect(usable.markets).toEqual(live.markets);
    expect(cacheState.reads).toBe(2);
    expect(MARKET_SNAPSHOT_MAX_AGE_MS).toBe(60_000);

    vi.advanceTimersByTime(10_001);
    await getMarketsWithFallback();
    expect(cacheState.reads).toBe(3);
  });

  it("lets a background refresh replace an older but usable snapshot", async () => {
    const { getMarketsWithFallback } = await importClient();
    const first = await getMarketsWithFallback();
    expect(first.markets[0].yesPrice).toBe(0.34);

    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta" ? metadata : { "#12090": "0.55", "#12091": "0.45" };
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }));
    vi.advanceTimersByTime(5_001);
    cacheState.returnStaleOnExpiry = true;
    const whileRefreshing = await getMarketsWithFallback();
    expect(whileRefreshing.markets[0].yesPrice).toBe(0.34);
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(10_001);
    const refreshed = await getMarketsWithFallback();
    expect(refreshed.source).toBe("live");
    expect(refreshed.markets[0].yesPrice).toBe(0.55);
  });

  it("fails closed for expired, invalid, and future snapshot timestamps", async () => {
    const { isMarketSnapshotUsable } = await importClient();
    const now = Date.parse("2026-09-24T12:00:00.000Z");

    expect(isMarketSnapshotUsable({ source: "stale", fetchedAt: "2026-09-24T11:59:50.000Z" }, now)).toBe(true);
    expect(isMarketSnapshotUsable({ source: "stale", fetchedAt: "2026-09-24T11:59:30.000Z" }, now)).toBe(true);
    expect(isMarketSnapshotUsable({ source: "live", fetchedAt: "2026-09-24T11:58:59.999Z" }, now)).toBe(false);
    expect(isMarketSnapshotUsable({ source: "live", fetchedAt: "not-a-date" }, now)).toBe(false);
    expect(isMarketSnapshotUsable({ source: "live", fetchedAt: "2026-09-24T12:00:00.001Z" }, now)).toBe(false);
    expect(isMarketSnapshotUsable({ source: "preview", fetchedAt: "2026-09-24T12:00:00.000Z" }, now)).toBe(false);
  });

  it("classifies a cached snapshot older than 60 seconds as stale", async () => {
    const { getMarketsWithFallback } = await importClient();
    expect((await getMarketsWithFallback()).source).toBe("live");

    vi.advanceTimersByTime(60_001);
    cacheState.returnStaleOnExpiry = true;
    expect((await getMarketsWithFallback()).source).toBe("stale");
  });

  it("does not label a transient upstream failure as live", async () => {
    const { getMarketsWithFallback } = await importClient();
    expect((await getMarketsWithFallback()).source).toBe("live");

    vi.advanceTimersByTime(5_001);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    const fallback = await getMarketsWithFallback();

    expect(fallback.source).toBe("preview");
  });

  it("uses preview data when the initial upstream request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    const { getMarketsWithFallback } = await importClient();

    const fallback = await getMarketsWithFallback();
    expect(fallback.source).toBe("preview");
    expect(fallback.markets).toHaveLength(4);
  });

  it("performs one bounded foreground refresh for a cold Movers request", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls <= 2) return new Response("upstream unavailable", { status: 503 });
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta" ? metadata : mids;
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    const { getMarketsForMovers } = await importClient();

    const result = await getMarketsForMovers();

    expect(result).toMatchObject({ source: "live", markets: [{ id: "1209" }] });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("coalesces concurrent foreground retries for Movers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      if (calls <= 2) return new Response("upstream unavailable", { status: 503 });
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta" ? metadata : mids;
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    const { getMarketsForMovers } = await importClient();

    const results = await Promise.all([
      getMarketsForMovers(),
      getMarketsForMovers(),
      getMarketsForMovers(),
    ]);

    expect(results.every((result) => result.source === "live")).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps Movers fail-closed when the foreground retry also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 503 })));
    const { getMarketsForMovers } = await importClient();

    const result = await getMarketsForMovers();

    expect(result.source).toBe("preview");
    expect(result.markets).toHaveLength(4);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("replaces an expired cached snapshot before calculating Movers", async () => {
    const { getMarketsForMovers, getMarketsWithFallback } = await importClient();
    expect((await getMarketsWithFallback()).markets[0].yesPrice).toBe(0.34);

    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta" ? metadata : { "#12090": "0.58", "#12091": "0.42" };
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    vi.advanceTimersByTime(60_001);
    cacheState.returnStaleOnExpiry = true;

    const result = await getMarketsForMovers();

    expect(result.source).toBe("live");
    expect(result.markets[0].yesPrice).toBe(0.58);
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

  it("keeps resolved markets out of a fresh normalized snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta"
        ? {
            outcomes: [
              metadata.outcomes[0],
              { ...metadata.outcomes[0], outcome: 1210, status: "resolved" },
            ],
            questions: [],
          }
        : { ...mids, "#12100": "0.9", "#12101": "0.1" };
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const { fetchMarkets } = await importClient();

    expect((await fetchMarkets()).map((market) => market.id)).toEqual(["1209"]);
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

describe("HIP-4 market search metadata", () => {
  it("preserves authoritative NBA and NFL metadata for team-name market titles", async () => {
    const outcomes = [
      {
        outcome: 1,
        name: "template:sportsContestWinner",
        description: "competition:NBA|participantA:Detroit Pistons|participantB:Boston Celtics|scheduledStart:20261018-1700|sport:basketball",
        venue: "out",
        sideSpecs: [{ name: "YES" }, { name: "NO" }],
      },
      {
        outcome: 2,
        name: "template:sportsTournamentParticipant",
        description: "participant:San Antonio Spurs",
        sideSpecs: [{ name: "YES" }, { name: "NO" }],
      },
      {
        outcome: 3,
        name: "template:sportsContestWinner",
        description: "competition:NFL|participantA:Baltimore Ravens|participantB:Cleveland Browns|scheduledStart:20261018-1700|sport:football",
        sideSpecs: [{ name: "YES" }, { name: "NO" }],
      },
      {
        outcome: 4,
        name: "template:sportsTotal",
        description: "line:41.5|measure:points|participantA:Baltimore Ravens|participantB:Cleveland Browns|scheduledStart:20261018-1700|sport:football",
        venue: "future-venue",
        sideSpecs: [{ name: "YES" }, { name: "NO" }],
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { type: string };
      const value = body.type === "outcomeMeta"
        ? {
            outcomes,
            questions: [{
              description: "competition:NBA|sport:basketball",
              namedOutcomes: [2],
            }],
          }
        : {};
      return new Response(JSON.stringify(value), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }));
    const { fetchMarkets } = await importClient();
    const markets = await fetchMarkets();

    expect(markets.find((market) => market.id === "1")).toMatchObject({
      name: "Will Detroit Pistons beat Boston Celtics?",
      searchTerms: ["NBA", "basketball"],
      category: "Sports",
      venue: "out",
    });
    expect(markets.find((market) => market.id === "2")?.searchTerms).toEqual(["NBA", "basketball"]);
    expect(markets.find((market) => market.id === "2")?.protocolNative).toBe(false);
    expect(markets.find((market) => market.id === "3")?.searchTerms).toEqual(["NFL", "football"]);
    expect(markets.find((market) => market.id === "4")?.searchTerms).toEqual(["NFL", "football"]);
    expect(markets.find((market) => market.id === "4")?.venue).toBe("future-venue");
  });
});

describe("HIP-4 market classification", () => {
  it("uses authoritative templates and perp identifiers instead of title guesses", async () => {
    const { classifyMarketCategory } = await importClient();

    expect(classifyMarketCategory({ name: "template:sportsContestWinner" })).toBe("Sports");
    expect(classifyMarketCategory({ name: "template:policyRateDecrease" })).toBe("Economics");
    expect(classifyMarketCategory({ name: "template:companyIpoConfirmed" })).toBe("Business");
    expect(classifyMarketCategory({
      name: "template:binaryPrice",
      description: "perp:BTC|threshold:100000|time:20261231-0000",
    })).toBe("Crypto");
    expect(classifyMarketCategory({
      name: "template:binaryPrice",
      description: "perp:xyz:NFLX|threshold:100|time:20261231-0000",
    })).toBe("Other");
    expect(classifyMarketCategory({
      name: "Recurring",
      description: "class:priceBinary|underlying:ETH|targetPrice:5000|expiry:20261231-0000",
    })).toBe("Crypto");
    expect(classifyMarketCategory({ name: "Will something happen?" })).toBe("Other");
  });

  it("identifies only no-venue recurring templates as protocol-native", async () => {
    const { isProtocolNativeOutcome } = await importClient();

    expect(isProtocolNativeOutcome({ name: "Recurring" })).toBe(true);
    expect(isProtocolNativeOutcome({ name: "Recurring Fallback" })).toBe(true);
    expect(isProtocolNativeOutcome({ name: "Recurring Named Outcome" })).toBe(true);
    expect(isProtocolNativeOutcome({ name: "template:sportsContestWinner" })).toBe(false);
    expect(isProtocolNativeOutcome({ name: "Recurring", venue: "out" })).toBe(false);
  });
});
