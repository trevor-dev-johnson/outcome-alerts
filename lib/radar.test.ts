import { afterEach, describe, expect, it, vi } from "vitest";
import { radarCategories, radarEnabled, radarInput, radarMatches, radarMovement, type RadarSubscription } from "./radar";
import { bucketStart, MOVER_WINDOW_RULES, type MoverWindow } from "./movers";
import type { Market } from "./types";

const now = Date.parse("2026-10-19T12:00:10Z");
const sample = (at: number, probability = .5) => ({ market_id: "1", bucket_at: new Date(bucketStart(at)).toISOString(), observed_at: new Date(at).toISOString(), yes_probability: probability });
const market: Market = { id: "1", name: "Lakers vs Warriors", searchTerms: ["NBA"], yesCoin: "#10", noCoin: "#11", yesPrice: .5, noPrice: .5 };
const subscription: RadarSubscription = { id: "s", target_kind: "category", target: "NBA", window_name: "5m", threshold_points: 5, generation: 1, paused: false };
afterEach(() => vi.unstubAllEnvs());

describe("Radar detector", () => {
  it.each(["5m", "1h", "24h"] as MoverWindow[])("uses verified endpoints for %s", (window) => {
    const b = sample(now - MOVER_WINDOW_RULES[window].durationMs, .4);
    expect(radarMovement(sample(now, .5), b, window, now)).toBeCloseTo(10);
    expect(radarMovement(sample(now, .3), b, window, now)).toBeCloseTo(-10);
  });
  it("rejects stale, future, malformed, mismatched, same-bucket, and out-of-tolerance observations", () => {
    const b = sample(now - 300_000);
    for (const c of [sample(now - 61_000), sample(now + 1), sample(now, NaN), sample(now, 1.1),
      { ...sample(now), market_id: "2" }, { ...sample(now), bucket_at: "bad" }, { ...sample(now), observed_at: "bad" }])
      expect(radarMovement(c, b, "5m", now)).toBeNull();
    expect(radarMovement(sample(now), sample(now - 10), "5m", now)).toBeNull();
    expect(radarMovement(sample(now), sample(now - 451_000), "5m", now)).toBeNull();
  });
  it("matches metadata only; not team names, NBA in titles, or NFLX", () => {
    expect(radarMatches(subscription, market)).toBe(true);
    expect(radarCategories({ ...market, searchTerms: ["NFL", "football"] })).toEqual(["NFL"]);
    expect(radarCategories({ ...market, searchTerms: ["USA National Football League (NFL)"] })).toEqual(["NFL"]);
    expect(radarCategories({ ...market, searchTerms: ["National Basketball Association (NBA)"] })).toEqual(["NBA"]);
    expect(radarCategories({ ...market, name: "NBA Lakers", searchTerms: [] })).toEqual([]);
    expect(radarCategories({ ...market, searchTerms: ["NFLX", "basketball"] })).toEqual([]);
    expect(radarMatches({ ...subscription, paused: true }, market)).toBe(false);
    expect(radarMatches({ ...subscription, target_kind: "market", target: "1" }, market)).toBe(true);
  });
  it("requires explicit opt-in and bounded valid configuration", () => {
    const input = { targetKind: "category", target: "NBA", window: "1h", threshold: 5, consent: "yes" };
    expect(radarInput.safeParse(input).success).toBe(true);
    for (const invalid of [{ consent: "no" }, { target: "NFLX" }, { threshold: 0 }, { threshold: Infinity }, { threshold: 101 }, { window: "1s" }])
      expect(radarInput.safeParse({ ...input, ...invalid }).success).toBe(false);
  });
  it("is disabled unless explicitly enabled", () => {
    vi.stubEnv("RADAR_NOTIFICATIONS_ENABLED", ""); expect(radarEnabled()).toBe(false);
    vi.stubEnv("RADAR_NOTIFICATIONS_ENABLED", "1"); expect(radarEnabled()).toBe(false);
    vi.stubEnv("RADAR_NOTIFICATIONS_ENABLED", "true"); expect(radarEnabled()).toBe(true);
  });
});
