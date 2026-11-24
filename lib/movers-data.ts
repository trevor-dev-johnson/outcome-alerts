import { unstable_cache } from "next/cache";
import { hasSupabaseEnv } from "@/lib/env";
import { getMarketsForMovers } from "@/lib/hyperliquid/client";
import {
  CURRENT_OBSERVATION_MAX_AGE_MS,
  MAX_MOVER_MARKET_IDS,
  MAX_MOVER_TOTAL_MARKET_IDS,
  MOVER_WINDOW_RULES,
  calculateMovers,
  type MarketProbabilityObservation,
  type Mover,
  type MoverWindow,
} from "@/lib/movers";
import { createPublicClient } from "@/lib/supabase/public";
import type { Market, MarketCategory } from "@/lib/types";

export const MOVERS_HISTORY_CACHE_SECONDS = 25;
export const MOVERS_HISTORY_MAX_CONCURRENCY = 2;
export const MOVERS_LAST_KNOWN_MAX_AGE_MS = 10 * 60_000;

export type MoversSnapshot = {
  state: "live" | "updating" | "last-known" | "collecting" | "stale" | "upstream-error" | "unavailable" | "empty";
  movers: Mover[];
  window: MoverWindow;
  fetchedAt: string | null;
  eligibleMarketCount: number;
  insufficientHistoryCount: number;
};

function getEligibleMarkets(
  snapshot: Awaited<ReturnType<typeof getMarketsForMovers>>,
  currentAt: number,
) {
  const eligible = snapshot.markets.filter((market) => {
    if (market.yesPrice == null) return false;
    const probability = Number(market.yesPrice);
    const closesAt = market.closesAt ? Date.parse(market.closesAt) : Number.NaN;
    return Number.isFinite(probability) && probability >= 0 && probability <= 1 &&
      (!Number.isFinite(closesAt) || closesAt > currentAt);
  });

  const byId = new Map(eligible.map((market) => [market.id, market]));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function splitIntoBatches<T>(values: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function loadPublicHistory(
  window: MoverWindow,
  eligibleMarkets: ReturnType<typeof getEligibleMarkets>,
  currentAt: number,
): Promise<MarketProbabilityObservation[]> {
  if (eligibleMarkets.length === 0) return [];
  if (eligibleMarkets.length > MAX_MOVER_TOTAL_MARKET_IDS) {
    throw new Error("HIP-4 market universe exceeds the bounded Movers total");
  }

  const { durationMs, toleranceMs } = MOVER_WINDOW_RULES[window];
  const supabase = createPublicClient();
  const marketIdBatches = splitIntoBatches(
    eligibleMarkets.map((market) => market.id),
    MAX_MOVER_MARKET_IDS,
  );
  const targetAt = new Date(currentAt - durationMs).toISOString();
  const toleranceSeconds = Math.round(toleranceMs / 1_000);
  const batchRows = await mapWithConcurrency(
    marketIdBatches,
    MOVERS_HISTORY_MAX_CONCURRENCY,
    async (marketIds, batchIndex) => {
      const { data, error } = await supabase.rpc("closest_market_probability_observations", {
        p_market_ids: marketIds,
        p_target_at: targetAt,
        p_tolerance_seconds: toleranceSeconds,
      });

      if (error) {
        console.error("movers_history_read_failed", {
          code: error.code,
          batchIndex,
          batchSize: marketIds.length,
        });
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
    },
  );
  return batchRows.flat();
}

const moversCacheOptions = {
  revalidate: MOVERS_HISTORY_CACHE_SECONDS,
  tags: ["public-hip4-movers-history"],
};

class MoversLoadError extends Error {
  constructor(readonly snapshot: MoversSnapshot) {
    super(`Movers data unavailable: ${snapshot.state}`);
  }
}

const MARKET_CATEGORIES = new Set<MarketCategory>([
  "Sports",
  "Crypto",
  "Economics",
  "Business",
  "Other",
]);

type DurableMoverRow = {
  snapshot_observed_at: unknown;
  snapshot_market_count: number | string;
  market_id: unknown;
  market_name: unknown;
  category: unknown;
  venue: unknown;
  protocol_native: unknown;
  closes_at: unknown;
  yes_probability: number | string;
  no_probability: number | string;
  historical_bucket_at: unknown;
  historical_observed_at: unknown;
  historical_yes_probability: number | string | null;
};

function finiteProbability(value: number | string | null) {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1 ? numeric : null;
}

function optionalCategory(value: unknown): MarketCategory | undefined {
  return typeof value === "string" && MARKET_CATEGORIES.has(value as MarketCategory)
    ? value as MarketCategory
    : undefined;
}

async function loadDurableMoversFallback(
  window: MoverWindow,
  now: number,
): Promise<MoversSnapshot | null> {
  if (!hasSupabaseEnv()) return null;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("read_market_movers_fallback", {
    p_window: window,
    p_max_age_seconds: MOVERS_LAST_KNOWN_MAX_AGE_MS / 1_000,
  });
  if (error) {
    console.error("movers_fallback_read_failed", { code: error.code });
    return null;
  }

  const rows = (data ?? []) as DurableMoverRow[];
  if (rows.length === 0) return null;

  const fetchedAt = String(rows[0].snapshot_observed_at ?? "");
  const observedAt = Date.parse(fetchedAt);
  const ageMs = now - observedAt;
  const expectedCount = Number(rows[0].snapshot_market_count);
  if (
    !Number.isFinite(observedAt) ||
    ageMs < 0 ||
    ageMs > MOVERS_LAST_KNOWN_MAX_AGE_MS ||
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount > MAX_MOVER_TOTAL_MARKET_IDS ||
    rows.length !== expectedCount ||
    rows.some((row) => String(row.snapshot_observed_at ?? "") !== fetchedAt)
  ) return null;

  const markets: Market[] = [];
  const observations: MarketProbabilityObservation[] = [];
  const marketIds = new Set<string>();
  for (const row of rows) {
    const marketId = String(row.market_id ?? "");
    const marketName = typeof row.market_name === "string" ? row.market_name : "";
    const yesPrice = finiteProbability(row.yes_probability);
    const noPrice = finiteProbability(row.no_probability);
    const closesAt = row.closes_at == null ? null : String(row.closes_at);
    const closesAtMs = closesAt ? Date.parse(closesAt) : Number.NaN;
    if (
      marketId.length < 1 ||
      marketId.length > 120 ||
      marketIds.has(marketId) ||
      marketName.length < 1 ||
      marketName.length > 500 ||
      yesPrice == null ||
      noPrice == null ||
      (closesAt != null && !Number.isFinite(closesAtMs)) ||
      (Number.isFinite(closesAtMs) && closesAtMs <= observedAt)
    ) return null;
    marketIds.add(marketId);

    markets.push({
      id: marketId,
      name: marketName,
      category: optionalCategory(row.category),
      venue: typeof row.venue === "string" && row.venue.length > 0 ? row.venue : undefined,
      protocolNative: row.protocol_native === true,
      yesCoin: "",
      noCoin: "",
      yesPrice,
      noPrice,
      closesAt,
    });

    if (
      row.historical_bucket_at != null &&
      row.historical_observed_at != null &&
      row.historical_yes_probability != null
    ) {
      observations.push({
        market_id: marketId,
        bucket_at: String(row.historical_bucket_at),
        observed_at: String(row.historical_observed_at),
        yes_probability: row.historical_yes_probability,
      });
    }
  }

  const movers = calculateMovers({
    markets,
    observations,
    currentObservedAt: fetchedAt,
    window,
    now,
    maxCurrentAgeMs: MOVERS_LAST_KNOWN_MAX_AGE_MS,
  });
  return {
    state: movers.length > 0 ? "last-known" : "collecting",
    movers,
    window,
    fetchedAt,
    eligibleMarketCount: markets.length,
    insufficientHistoryCount: Math.max(0, markets.length - movers.length),
  };
}

async function calculateMoversSnapshot(window: MoverWindow): Promise<MoversSnapshot> {
  const marketSnapshot = await getMarketsForMovers();
  const empty: Omit<MoversSnapshot, "state"> = {
    movers: [],
    window,
    fetchedAt: marketSnapshot.fetchedAt,
    eligibleMarketCount: 0,
    insufficientHistoryCount: 0,
  };

  if (marketSnapshot.source === "preview") {
    throw new MoversLoadError({ ...empty, state: "upstream-error" });
  }
  if (!hasSupabaseEnv()) {
    throw new MoversLoadError({ ...empty, state: "unavailable" });
  }

  const currentAt = Date.parse(marketSnapshot.fetchedAt);
  const currentAgeMs = Date.now() - currentAt;
  if (
    !Number.isFinite(currentAt) ||
    currentAgeMs < 0 ||
    currentAgeMs > CURRENT_OBSERVATION_MAX_AGE_MS
  ) {
    throw new MoversLoadError({ ...empty, state: "stale" });
  }

  const eligibleMarkets = getEligibleMarkets(marketSnapshot, currentAt);
  if (eligibleMarkets.length === 0) return { ...empty, state: "empty" };
  if (eligibleMarkets.length > MAX_MOVER_TOTAL_MARKET_IDS) {
    console.error("movers_market_limit_exceeded", { marketCount: eligibleMarkets.length });
    throw new MoversLoadError({
      ...empty,
      state: "unavailable",
      eligibleMarketCount: eligibleMarkets.length,
      insufficientHistoryCount: eligibleMarkets.length,
    });
  }
  let observations: MarketProbabilityObservation[];
  try {
    observations = await loadPublicHistory(window, eligibleMarkets, currentAt);
  } catch {
    throw new MoversLoadError({
      ...empty,
      state: "unavailable",
      eligibleMarketCount: eligibleMarkets.length,
      insufficientHistoryCount: eligibleMarkets.length,
    });
  }

  const movers = calculateMovers({
    markets: eligibleMarkets,
    observations,
    currentObservedAt: marketSnapshot.fetchedAt,
    window,
    now: Date.now(),
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

const loadCached5mMovers = unstable_cache(
  () => calculateMoversSnapshot("5m"),
  ["public-hip4-movers-result-v1", "5m"],
  moversCacheOptions,
);
const loadCached1hMovers = unstable_cache(
  () => calculateMoversSnapshot("1h"),
  ["public-hip4-movers-result-v1", "1h"],
  moversCacheOptions,
);
const loadCached24hMovers = unstable_cache(
  () => calculateMoversSnapshot("24h"),
  ["public-hip4-movers-result-v1", "24h"],
  moversCacheOptions,
);

function loadCachedMovers(window: MoverWindow) {
  if (window === "5m") return loadCached5mMovers();
  if (window === "1h") return loadCached1hMovers();
  return loadCached24hMovers();
}

export async function getMoversSnapshot(
  window: MoverWindow,
  now = Date.now(),
): Promise<MoversSnapshot> {
  try {
    const snapshot = await loadCachedMovers(window);
    const observedAt = snapshot.fetchedAt ? Date.parse(snapshot.fetchedAt) : Number.NaN;
    const ageMs = now - observedAt;

    if (!Number.isFinite(observedAt) || ageMs < 0 || ageMs > MOVERS_LAST_KNOWN_MAX_AGE_MS) {
      return await loadDurableMoversFallback(window, now) ??
        { ...snapshot, state: "stale", movers: [] };
    }
    if (ageMs > CURRENT_OBSERVATION_MAX_AGE_MS && snapshot.movers.length > 0) {
      return { ...snapshot, state: "last-known" };
    }
    if (ageMs > CURRENT_OBSERVATION_MAX_AGE_MS) {
      return { ...snapshot, state: "stale", movers: [] };
    }
    return snapshot;
  } catch (error) {
    const fallback = await loadDurableMoversFallback(window, now);
    if (fallback) return fallback;
    if (error instanceof MoversLoadError) return error.snapshot;
    console.error("movers_snapshot_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      state: "unavailable",
      movers: [],
      window,
      fetchedAt: null,
      eligibleMarketCount: 0,
      insufficientHistoryCount: 0,
    };
  }
}
