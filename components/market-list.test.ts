import { afterEach, describe, expect, it, vi } from "vitest";
import { displayedSource, filterMarkets } from "./market-list";
import type { Market } from "@/lib/types";

describe("market snapshot freshness display", () => {
  afterEach(() => vi.useRealTimers());

  it("marks an API or CDN snapshot stale after the five-second freshness window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:05.001Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("stale");
  });

  it("preserves live and preview states inside the freshness window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:04.999Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("live");
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
