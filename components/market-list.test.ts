import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MARKET_DISCOVERY_OPTIONS,
  displayedSource,
  filterAndSortMarkets,
  filterMarkets,
  formatVenueLabel,
  MISSING_VENUE_FILTER,
  PROTOCOL_NATIVE_VENUE_FILTER,
} from "./market-list";
import type { Market } from "@/lib/types";

describe("market snapshot freshness display", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a ten-to-thirty-second API or CDN snapshot usable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:30.000Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("live");
  });

  it("marks a snapshot stale after the sixty-second usability window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:01:00.001Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("stale");
  });

  it("fails closed for invalid or future live timestamps and preserves preview", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:00.000Z"));

    expect(displayedSource("live", "not-a-date")).toBe("stale");
    expect(displayedSource("live", "2026-09-24T12:00:00.001Z")).toBe("stale");
    expect(displayedSource("preview", "not-a-date")).toBe("preview");
  });
});

function market(overrides: Partial<Market>): Market {
  return {
    id: "1",
    name: "Will Detroit Pistons beat Boston Celtics?",
    yesCoin: "#10",
    noCoin: "#11",
    yesPrice: 0.45,
    noPrice: 0.55,
    ...overrides,
  };
}

describe("market search", () => {
  it("matches authoritative league metadata when team-name titles omit the league", () => {
    const nbaGame = market({ searchTerms: ["NBA", "basketball"] });
    const nflGame = market({
      id: "2",
      name: "Will Baltimore Ravens beat Cleveland Browns?",
      searchTerms: ["NFL", "football"],
    });

    expect(filterMarkets([nbaGame, nflGame], "NBA")).toEqual([nbaGame]);
    expect(filterMarkets([nbaGame, nflGame], "nfl")).toEqual([nflGame]);
  });

  it("does not guess a league from team names without authoritative search metadata", () => {
    expect(filterMarkets([market({ searchTerms: ["basketball"] })], "NBA")).toEqual([]);
  });

  it("preserves title search and ignores surrounding query whitespace", () => {
    const pistons = market({ searchTerms: ["NBA"] });
    expect(filterMarkets([pistons], "  pistons  ")).toEqual([pistons]);
  });

  it("does not mix stock tickers into authoritative league searches", () => {
    const nflGame = market({ searchTerms: ["USA National Football League (NFL)"] });
    const netflix = market({
      id: "2",
      name: "Will xyz:NFLX be above $78?",
      searchTerms: [],
    });

    expect(filterMarkets([nflGame, netflix], "NFL")).toEqual([nflGame]);
  });
});

describe("market discovery filters", () => {
  const sports = market({ category: "Sports", venue: "out", searchTerms: ["NBA"] });
  const crypto = market({
    id: "2",
    name: "Will BTC be above $100,000?",
    category: "Crypto",
    venue: "skew",
    yesPrice: 0.75,
    noPrice: 0.25,
  });
  const economics = market({
    id: "3",
    name: "Will the Fed decrease rates?",
    category: "Economics",
    venue: "out",
    yesPrice: 0.2,
    noPrice: 0.8,
  });
  const unpriced = market({
    id: "4",
    name: "Legacy market",
    category: "Other",
    venue: undefined,
    yesPrice: null,
    noPrice: null,
  });
  const protocolNative = market({
    id: "9",
    name: "Will BTC be above its daily threshold?",
    category: "Crypto",
    venue: undefined,
    protocolNative: true,
  });

  it("defaults to the complete market universe in market order", () => {
    expect(DEFAULT_MARKET_DISCOVERY_OPTIONS).toEqual({
      query: "",
      category: "all",
      venue: "all",
      sort: "default",
    });
    expect(filterAndSortMarkets(
      [sports, crypto, economics, unpriced],
      DEFAULT_MARKET_DISCOVERY_OPTIONS,
    )).toEqual([sports, crypto, economics, unpriced]);
  });

  it("combines search, authoritative category, and venue filters", () => {
    expect(filterAndSortMarkets([sports, crypto, economics], {
      query: "NBA",
      category: "Sports",
      venue: "out",
      sort: "default",
    })).toEqual([sports]);

    expect(filterAndSortMarkets([sports, crypto, economics], {
      query: "",
      category: "Economics",
      venue: "skew",
      sort: "default",
    })).toEqual([]);
  });

  it("composes category, exact venue, search, and sorting without changing identifiers", () => {
    const sportsOnSkew = market({
      id: "5",
      name: "Will Team A win?",
      category: "Sports",
      venue: "skew",
      searchTerms: ["NFL"],
      yesPrice: 0.6,
      noPrice: 0.4,
    });
    const lowerSportsOnOut = market({
      id: "6",
      name: "Will Team B win?",
      category: "Sports",
      venue: "out",
      searchTerms: ["NBA"],
      yesPrice: 0.3,
      noPrice: 0.7,
    });
    const cryptoOnOut = market({
      id: "7",
      name: "Will ETH touch $5,000?",
      category: "Crypto",
      venue: "out",
      yesPrice: 0.1,
      noPrice: 0.9,
    });

    expect(filterAndSortMarkets([sports, crypto, economics, sportsOnSkew], {
      query: "",
      category: "Sports",
      venue: "skew",
      sort: "default",
    })).toEqual([sportsOnSkew]);
    expect(filterAndSortMarkets([sports, crypto, cryptoOnOut], {
      query: "",
      category: "Crypto",
      venue: "out",
      sort: "default",
    })).toEqual([cryptoOnOut]);
    expect(filterAndSortMarkets([sports, lowerSportsOnOut, sportsOnSkew], {
      query: "NBA",
      category: "Sports",
      venue: "out",
      sort: "yes-high",
    })).toEqual([sports, lowerSportsOnOut]);
    expect(filterAndSortMarkets([sports, crypto, economics], {
      query: "BTC",
      category: "all",
      venue: "skew",
      sort: "default",
    })).toEqual([crypto]);
    expect(filterAndSortMarkets([sports, crypto, cryptoOnOut], {
      query: "",
      category: "all",
      venue: "OUT",
      sort: "default",
    })).toEqual([]);
  });

  it("separates positively identified protocol-native markets from unknown missing venues", () => {
    expect(filterAndSortMarkets([sports, unpriced, protocolNative], {
      query: "",
      category: "all",
      venue: MISSING_VENUE_FILTER,
      sort: "default",
    })).toEqual([unpriced]);
    expect(filterAndSortMarkets([sports, unpriced, protocolNative], {
      query: "",
      category: "all",
      venue: PROTOCOL_NATIVE_VENUE_FILTER,
      sort: "default",
    })).toEqual([protocolNative]);
  });

  it("uses the HIP-4 txyz venue code and never aliases it to HIP-3 xyz", () => {
    const tradeXyz = market({ id: "8", venue: "txyz", category: "Other" });

    expect(filterAndSortMarkets([tradeXyz], {
      ...DEFAULT_MARKET_DISCOVERY_OPTIONS,
      venue: "txyz",
    })).toEqual([tradeXyz]);
    expect(filterAndSortMarkets([tradeXyz], {
      ...DEFAULT_MARKET_DISCOVERY_OPTIONS,
      venue: "xyz",
    })).toEqual([]);
  });

  it("sorts valid YES probabilities and keeps missing prices last", () => {
    expect(filterAndSortMarkets([economics, unpriced, crypto], {
      query: "",
      category: "all",
      venue: "all",
      sort: "yes-high",
    })).toEqual([crypto, economics, unpriced]);

    expect(filterAndSortMarkets([crypto, unpriced, economics], {
      query: "",
      category: "all",
      venue: "all",
      sort: "yes-low",
    })).toEqual([economics, crypto, unpriced]);
  });
});

describe("HIP-4 venue labels", () => {
  it("labels only verified venue codes and preserves unknown codes", () => {
    expect(formatVenueLabel("out")).toBe("Outcome (out)");
    expect(formatVenueLabel("skew")).toBe("Skew (skew)");
    expect(formatVenueLabel("txyz")).toBe("trade[XYZ] (txyz)");
    expect(formatVenueLabel("fox")).toBe("FOX (fox)");
    expect(formatVenueLabel("fix")).toBe("fix");
    expect(formatVenueLabel("future-venue")).toBe("future-venue");
  });
});
