import type { Market } from "@/lib/types";

export const MOVER_WINDOWS = ["5m", "1h", "24h"] as const;
export type MoverWindow = (typeof MOVER_WINDOWS)[number];

export const OBSERVATION_BUCKET_MS = 5 * 60_000;
export const OBSERVATION_RETENTION_MS = 48 * 60 * 60_000;
export const CURRENT_OBSERVATION_MAX_AGE_MS = 60_000;
export const MAX_MOVER_MARKET_IDS = 300;

export const MOVER_WINDOW_RULES: Record<MoverWindow, {
  durationMs: number;
  toleranceMs: number;
  label: string;
}> = {
  "5m": { durationMs: 5 * 60_000, toleranceMs: 2.5 * 60_000, label: "5m" },
  "1h": { durationMs: 60 * 60_000, toleranceMs: 5 * 60_000, label: "1h" },
  "24h": { durationMs: 24 * 60 * 60_000, toleranceMs: 10 * 60_000, label: "24h" },
};

export type MarketProbabilityObservation = {
  market_id: string;
  bucket_at: string;
  observed_at: string;
  yes_probability: number | string;
};

export type Mover = {
  marketId: string;
  marketName: string;
  closesAt: string | null;
  currentProbability: number;
  historicalProbability: number;
  deltaPoints: number;
  direction: "up" | "down" | "flat";
  window: MoverWindow;
  currentObservedAt: string;
  historicalObservedAt: string;
};

export function parseMoverWindow(value: string | string[] | undefined): MoverWindow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return MOVER_WINDOWS.includes(candidate as MoverWindow) ? candidate as MoverWindow : "1h";
}

export function bucketStart(timestampMs: number) {
  return Math.floor(timestampMs / OBSERVATION_BUCKET_MS) * OBSERVATION_BUCKET_MS;
}

function finiteProbability(value: number | string | null | undefined) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : null;
}

export function calculateMovers({
  markets,
  observations,
  currentObservedAt,
  window,
  now = Date.now(),
}: {
  markets: Market[];
  observations: MarketProbabilityObservation[];
  currentObservedAt: string;
  window: MoverWindow;
  now?: number;
}): Mover[] {
  const currentAt = Date.parse(currentObservedAt);
  if (!Number.isFinite(currentAt) || now - currentAt > CURRENT_OBSERVATION_MAX_AGE_MS) return [];

  const { durationMs, toleranceMs } = MOVER_WINDOW_RULES[window];
  const targetAt = currentAt - durationMs;
  const byMarket = new Map<string, MarketProbabilityObservation[]>();
  for (const observation of observations) {
    const values = byMarket.get(observation.market_id) ?? [];
    values.push(observation);
    byMarket.set(observation.market_id, values);
  }

  const movers: Mover[] = [];
  for (const market of markets) {
    const currentProbability = finiteProbability(market.yesPrice);
    if (currentProbability == null) continue;

    const closesAt = market.closesAt ? Date.parse(market.closesAt) : Number.NaN;
    if (Number.isFinite(closesAt) && closesAt <= currentAt) continue;

    let historical: MarketProbabilityObservation | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of byMarket.get(market.id) ?? []) {
      const candidateAt = Date.parse(candidate.observed_at);
      const probability = finiteProbability(candidate.yes_probability);
      if (!Number.isFinite(candidateAt) || probability == null) continue;
      const distance = Math.abs(candidateAt - targetAt);
      if (distance < closestDistance) {
        historical = candidate;
        closestDistance = distance;
      }
    }

    if (!historical || closestDistance > toleranceMs) continue;
    const historicalProbability = finiteProbability(historical.yes_probability);
    if (historicalProbability == null) continue;
    const deltaPoints = Math.round((currentProbability - historicalProbability) * 100_000_000) / 1_000_000;
    movers.push({
      marketId: market.id,
      marketName: market.name,
      closesAt: market.closesAt ?? null,
      currentProbability,
      historicalProbability,
      deltaPoints,
      direction: deltaPoints > 0 ? "up" : deltaPoints < 0 ? "down" : "flat",
      window,
      currentObservedAt,
      historicalObservedAt: historical.observed_at,
    });
  }

  return movers.sort((a, b) =>
    Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints) ||
    a.marketName.localeCompare(b.marketName),
  );
}
