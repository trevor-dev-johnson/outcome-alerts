import { z } from "zod";
import { bucketStart, MOVER_WINDOW_RULES, OBSERVATION_BUCKET_MS, type MarketProbabilityObservation, type MoverWindow } from "./movers";
import type { Market } from "./types";

export const RADAR_MAX_MARKETS = 900;
export const RADAR_MAX_SUBSCRIPTIONS = 1000;
export const RADAR_CURRENT_MAX_AGE_MS = 60_000;
export const radarInput = z.object({
  targetKind: z.enum(["market", "category"]),
  target: z.string().min(1).max(120),
  window: z.enum(["5m", "1h", "24h"]),
  threshold: z.coerce.number().min(1).max(100),
  consent: z.literal("yes"),
}).refine((v) => v.targetKind === "category" ? ["NBA", "NFL"].includes(v.target) : /^\d+$/.test(v.target));

export interface RadarSubscription {
  id: string;
  target_kind: "market" | "category";
  target: string;
  window_name: MoverWindow;
  threshold_points: number;
  generation: number;
  paused: boolean;
}

// searchTerms are assembled only from explicit upstream league/competition/sport
// metadata (including exact-contest inheritance), never from market titles.
export function radarCategories(market: Market): string[] {
  return ["NBA", "NFL"].filter((category) =>
    market.searchTerms?.some((term) => term.toUpperCase().split(/[^A-Z0-9]+/).includes(category)),
  );
}

export function radarMatches(subscription: RadarSubscription, market: Market) {
  return !subscription.paused && (subscription.target_kind === "market"
    ? subscription.target === market.id
    : radarCategories(market).includes(subscription.target));
}

function validObservation(row: MarketProbabilityObservation) {
  const time = Date.parse(row.observed_at);
  const bucket = Date.parse(row.bucket_at);
  const probability = Number(row.yes_probability);
  return Number.isFinite(time) && bucket === bucketStart(time)
    && row.yes_probability !== null && row.yes_probability !== ""
    && Number.isFinite(probability) && probability >= 0 && probability <= 1;
}

export function radarMovement(
  current: MarketProbabilityObservation,
  baseline: MarketProbabilityObservation,
  window: MoverWindow,
  now: number,
) {
  if (!validObservation(current) || !validObservation(baseline) || current.market_id !== baseline.market_id) return null;
  const currentAt = Date.parse(current.observed_at);
  const baselineAt = Date.parse(baseline.observed_at);
  const rule = MOVER_WINDOW_RULES[window];
  if (currentAt > now || now - currentAt > RADAR_CURRENT_MAX_AGE_MS
    || currentAt - baselineAt < OBSERVATION_BUCKET_MS / 2
    || current.bucket_at === baseline.bucket_at
    || Math.abs(currentAt - baselineAt - rule.durationMs) > rule.toleranceMs) return null;
  return (Number(current.yes_probability) - Number(baseline.yes_probability)) * 100;
}

export function radarEnabled() {
  return process.env.RADAR_NOTIFICATIONS_ENABLED === "true";
}
