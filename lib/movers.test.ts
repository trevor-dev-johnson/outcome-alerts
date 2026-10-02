import { describe, expect, it } from "vitest";
import type { Market } from "@/lib/types";
import {
  OBSERVATION_BUCKET_MS,
  bucketStart,
  calculateMovers,
  parseMoverWindow,
  type MarketProbabilityObservation,
  type MoverWindow,
} from "./movers";

const CURRENT_AT = Date.parse("2026-09-30T12:00:00.000Z");

function market(overrides: Partial<Market> = {}): Market {
  return {
    id: "101",
    name: "Will the outcome happen?",
    yesCoin: "#1010",
    noCoin: "#1011",
    yesPrice: 0.6,
    noPrice: 0.4,
    closesAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function observation(
  marketId: string,
  probability: number,
  observedAt: number,
): MarketProbabilityObservation {
  return {
    market_id: marketId,
    bucket_at: new Date(bucketStart(observedAt)).toISOString(),
    observed_at: new Date(observedAt).toISOString(),
    yes_probability: probability,
  };
}

function calculate(
  window: MoverWindow,
  markets: Market[],
  observations: MarketProbabilityObservation[],
  now = CURRENT_AT,
) {
  return calculateMovers({
    window,
    markets,
    observations,
    currentObservedAt: new Date(CURRENT_AT).toISOString(),
    now,
  });
}

describe("HIP-4 mover calculation", () => {
  it.each([
    ["5m", 5 * 60_000],
    ["1h", 60 * 60_000],
    ["24h", 24 * 60 * 60_000],
  ] as const)("calculates the %s window from observation timestamps", (window, durationMs) => {
    const result = calculate(window, [market()], [observation("101", 0.5, CURRENT_AT - durationMs)]);
    expect(result[0]).toMatchObject({
      currentProbability: 0.6,
      historicalProbability: 0.5,
      deltaPoints: 10,
      direction: "up",
      window,
    });
  });

  it("keeps negative movement signed", () => {
    const result = calculate("1h", [market({ yesPrice: 0.42 })], [
      observation("101", 0.55, CURRENT_AT - 60 * 60_000),
    ]);
    expect(result[0]).toMatchObject({ deltaPoints: -13, direction: "down" });
  });

  it("ranks upward and downward moves by absolute point delta", () => {
    const markets = [
      market({ id: "up", name: "Up", yesPrice: 0.65 }),
      market({ id: "down", name: "Down", yesPrice: 0.3 }),
    ];
    const observations = [
      observation("up", 0.55, CURRENT_AT - 60 * 60_000),
      observation("down", 0.5, CURRENT_AT - 60 * 60_000),
    ];
    expect(calculate("1h", markets, observations).map((item) => item.marketId)).toEqual(["down", "up"]);
  });

  it("accepts the closest observation within tolerance", () => {
    const target = CURRENT_AT - 60 * 60_000;
    const result = calculate("1h", [market()], [
      observation("101", 0.4, target - 4 * 60_000),
      observation("101", 0.5, target + 60_000),
    ]);
    expect(result[0].historicalProbability).toBe(0.5);
  });

  it("does not call an out-of-tolerance observation an exact move", () => {
    const result = calculate("1h", [market()], [
      observation("101", 0.5, CURRENT_AT - 66 * 60_000),
    ]);
    expect(result).toEqual([]);
  });

  it("handles missing history and newly listed markets as insufficient", () => {
    const markets = [market({ id: "missing" }), market({ id: "new" })];
    const observations = [observation("new", 0.5, CURRENT_AT - 10 * 60_000)];
    expect(calculate("1h", markets, observations)).toEqual([]);
  });

  it("rejects stale current observations", () => {
    expect(calculate("1h", [market()], [
      observation("101", 0.5, CURRENT_AT - 60 * 60_000),
    ], CURRENT_AT + 61_000)).toEqual([]);
  });

  it("excludes closed markets and malformed probabilities", () => {
    const markets = [
      market({ id: "closed", closesAt: new Date(CURRENT_AT).toISOString() }),
      market({ id: "malformed", yesPrice: 1.2 }),
      market({ id: "missing", yesPrice: null }),
    ];
    const observations = [
      observation("closed", 0.5, CURRENT_AT - 60 * 60_000),
      observation("malformed", 0.5, CURRENT_AT - 60 * 60_000),
      observation("missing", 0.5, CURRENT_AT - 60 * 60_000),
    ];
    expect(calculate("1h", markets, observations)).toEqual([]);
  });

  it("uses deterministic five-minute UTC bucket boundaries", () => {
    const justBefore = Date.parse("2026-09-30T12:04:59.999Z");
    const boundary = Date.parse("2026-09-30T12:05:00.000Z");
    expect(bucketStart(justBefore)).toBe(Date.parse("2026-09-30T12:00:00.000Z"));
    expect(bucketStart(boundary)).toBe(boundary);
    expect(boundary - bucketStart(justBefore)).toBe(OBSERVATION_BUCKET_MS);
  });

  it("defaults invalid shared window parameters to 1h", () => {
    expect(parseMoverWindow("5m")).toBe("5m");
    expect(parseMoverWindow("24h")).toBe("24h");
    expect(parseMoverWindow("week")).toBe("1h");
    expect(parseMoverWindow(undefined)).toBe("1h");
  });
});
