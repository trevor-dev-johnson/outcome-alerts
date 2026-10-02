import { unstable_cache } from "next/cache";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";
import {
  CURRENT_OBSERVATION_MAX_AGE_MS,
  MAX_MOVER_MARKET_IDS,
  MOVER_WINDOW_RULES,
  calculateMovers,
  type MarketProbabilityObservation,
  type Mover,
  type MoverWindow,
} from "@/lib/movers";
import { createPublicClient } from "@/lib/supabase/public";

export const MOVERS_HISTORY_CACHE_SECONDS = 25;

export type MoversSnapshot = {
  state: "live" | "updating" | "collecting" | "stale" | "upstream-error" | "unavailable" | "empty";
  movers: Mover[];
  window: MoverWindow;
  fetchedAt: string | null;
  eligibleMarketCount: number;
  insufficientHistoryCount: number;
};

function getEligibleMarkets(
  snapshot: Awaited<ReturnType<typeof getMarketsWithFallback>>,
  currentAt: number,
) {
  return snapshot.markets.filter((market) => {
    if (market.yesPrice == null) return false;
    const probability = Number(market.yesPrice);
    const closesAt = market.closesAt ? Date.parse(market.closesAt) : Number.NaN;
    return Number.isFinite(probability) && probability >= 0 && probability <= 1 &&
      (!Number.isFinite(closesAt) || closesAt > currentAt);
  });
}

async function loadPublicHistory(window: MoverWindow): Promise<MarketProbabilityObservation[]> {
  const marketSnapshot = await getMarketsWithFallback();
  if (marketSnapshot.source === "preview") throw new Error("Live HIP-4 markets are unavailable");

  const currentAt = Date.parse(marketSnapshot.fetchedAt);
  if (!Number.isFinite(currentAt)) throw new Error("HIP-4 market timestamp is invalid");

  const eligibleMarkets = getEligibleMarkets(marketSnapshot, currentAt);
  if (eligibleMarkets.length === 0) return [];
  if (eligibleMarkets.length > MAX_MOVER_MARKET_IDS) {
    throw new Error("HIP-4 market universe exceeds the public history bound");
  }

  const { durationMs, toleranceMs } = MOVER_WINDOW_RULES[window];
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("closest_market_probability_observations", {
    p_market_ids: eligibleMarkets.map((market) => market.id),
    p_target_at: new Date(currentAt - durationMs).toISOString(),
    p_tolerance_seconds: Math.round(toleranceMs / 1_000),
  });

  if (error) {
    console.error("movers_history_read_failed", { code: error.code });
    throw new Error("Public Movers history is unavailable");
  }

  const rows = (data ?? []) as Array<{
    market_id: unknown;
    bucket_at: unknown;
    observed_at: unknown;
    yes_probability: number | string;
  }>;
  return rows.map((row) => ({
    market_id: String(row.market_id),
    bucket_at: String(row.bucket_at),
    observed_at: String(row.observed_at),
    yes_probability: row.yes_probability,
  }));
}

const historyCacheOptions = {
  revalidate: MOVERS_HISTORY_CACHE_SECONDS,
  tags: ["public-hip4-movers-history"],
};

const loadCached5mHistory = unstable_cache(
  () => loadPublicHistory("5m"),
  ["public-hip4-movers-history-v1", "5m"],
  historyCacheOptions,
);
const loadCached1hHistory = unstable_cache(
  () => loadPublicHistory("1h"),
  ["public-hip4-movers-history-v1", "1h"],
  historyCacheOptions,
);
const loadCached24hHistory = unstable_cache(
  () => loadPublicHistory("24h"),
  ["public-hip4-movers-history-v1", "24h"],
  historyCacheOptions,
);

function loadCachedHistory(window: MoverWindow) {
  if (window === "5m") return loadCached5mHistory();
  if (window === "1h") return loadCached1hHistory();
  return loadCached24hHistory();
}

export async function getMoversSnapshot(
  window: MoverWindow,
  now = Date.now(),
): Promise<MoversSnapshot> {
  const marketSnapshot = await getMarketsWithFallback();
  const empty: Omit<MoversSnapshot, "state"> = {
    movers: [],
    window,
    fetchedAt: marketSnapshot.fetchedAt,
    eligibleMarketCount: 0,
    insufficientHistoryCount: 0,
  };

  if (marketSnapshot.source === "preview") return { ...empty, state: "upstream-error" };
  if (!hasSupabaseEnv()) return { ...empty, state: "unavailable" };

  const currentAt = Date.parse(marketSnapshot.fetchedAt);
  if (!Number.isFinite(currentAt) || now - currentAt > CURRENT_OBSERVATION_MAX_AGE_MS) {
    return { ...empty, state: "stale" };
  }

  const eligibleMarkets = getEligibleMarkets(marketSnapshot, currentAt);
  if (eligibleMarkets.length === 0) return { ...empty, state: "empty" };
  if (eligibleMarkets.length > MAX_MOVER_MARKET_IDS) {
    console.error("movers_market_limit_exceeded", { marketCount: eligibleMarkets.length });
    return {
      ...empty,
      state: "unavailable",
      eligibleMarketCount: eligibleMarkets.length,
      insufficientHistoryCount: eligibleMarkets.length,
    };
  }
  let observations: MarketProbabilityObservation[];
  try {
    observations = await loadCachedHistory(window);
  } catch {
    return {
      ...empty,
      state: "unavailable",
      eligibleMarketCount: eligibleMarkets.length,
      insufficientHistoryCount: eligibleMarkets.length,
    };
  }

  const movers = calculateMovers({
    markets: eligibleMarkets,
    observations,
    currentObservedAt: marketSnapshot.fetchedAt,
    window,
    now,
  });

  return {
    state: movers.length > 0
      ? marketSnapshot.source === "stale" ? "updating" : "live"
      : "collecting",
    movers,
    window,
    fetchedAt: marketSnapshot.fetchedAt,
    eligibleMarketCount: eligibleMarkets.length,
    insufficientHistoryCount: Math.max(0, eligibleMarkets.length - movers.length),
  };
}
