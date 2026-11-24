import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OBSERVATION_RETENTION_MS,
  bucketStart,
} from "@/lib/movers";
import type { Market } from "@/lib/types";
import { defaultSupabaseRetryOptions, type RetryOptions, withRetry } from "./retry";

const CLEANUP_INTERVAL_MS = 60 * 60_000;

export type MarketHistoryRow = {
  market_id: string;
  bucket_at: string;
  observed_at: string;
  yes_probability: number;
};

export type CurrentMarketSnapshotRow = {
  market_id: string;
  market_name: string;
  category: string | null;
  venue: string | null;
  protocol_native: boolean;
  closes_at: string | null;
  yes_probability: number;
  no_probability: number;
};

export interface MarketHistoryStore {
  insertBucket(rows: MarketHistoryRow[]): Promise<void>;
  publishCurrentSnapshot(observedAt: string, rows: CurrentMarketSnapshotRow[]): Promise<void>;
  deleteBefore(cutoff: string): Promise<void>;
}

export function createSupabaseMarketHistoryStore(supabase: SupabaseClient): MarketHistoryStore {
  return {
    async insertBucket(rows) {
      const { error } = await supabase
        .from("market_probability_observations")
        .upsert(rows, {
          onConflict: "market_id,bucket_at",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    },
    async publishCurrentSnapshot(observedAt, rows) {
      const { error } = await supabase.rpc("publish_market_current_snapshot", {
        p_observed_at: observedAt,
        p_markets: rows,
      });
      if (error) throw error;
    },
    async deleteBefore(cutoff) {
      const { error } = await supabase
        .from("market_probability_observations")
        .delete()
        .lt("observed_at", cutoff);
      if (error) throw error;
    },
  };
}

type MarketHistoryRecorderOptions = {
  now?: () => number;
  retry?: Partial<RetryOptions>;
  retentionMs?: number;
  cleanupIntervalMs?: number;
};

export class MarketHistoryRecorder {
  private inFlight: Promise<{ inserted: number; cleaned: boolean }> | null = null;
  private lastCleanupAt = 0;
  private readonly now: () => number;
  private readonly retry: RetryOptions;
  private readonly retentionMs: number;
  private readonly cleanupIntervalMs: number;

  constructor(
    private readonly store: MarketHistoryStore,
    private readonly loadMarkets: () => Promise<Market[]>,
    options: MarketHistoryRecorderOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.retry = { ...defaultSupabaseRetryOptions, ...options.retry };
    this.retentionMs = options.retentionMs ?? OBSERVATION_RETENTION_MS;
    this.cleanupIntervalMs = options.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS;
  }

  record() {
    if (!this.inFlight) {
      this.inFlight = this.recordOnce().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  private async recordOnce() {
    const markets = await this.loadMarkets();
    const observedAtMs = this.now();
    const observedAt = new Date(observedAtMs).toISOString();
    const bucketAt = new Date(bucketStart(observedAtMs)).toISOString();
    const rows: MarketHistoryRow[] = [];
    const snapshotRows: CurrentMarketSnapshotRow[] = [];

    for (const market of markets) {
      if (market.yesPrice == null || market.noPrice == null) continue;
      const probability = Number(market.yesPrice);
      const noProbability = Number(market.noPrice);
      if (
        !Number.isFinite(probability) || probability < 0 || probability > 1 ||
        !Number.isFinite(noProbability) || noProbability < 0 || noProbability > 1
      ) continue;
      const closesAt = market.closesAt ? Date.parse(market.closesAt) : Number.NaN;
      if (Number.isFinite(closesAt) && closesAt <= observedAtMs) continue;
      rows.push({
        market_id: market.id,
        bucket_at: bucketAt,
        observed_at: observedAt,
        yes_probability: probability,
      });
      snapshotRows.push({
        market_id: market.id,
        market_name: market.name,
        category: market.category ?? null,
        venue: market.venue ?? null,
        protocol_native: market.protocolNative ?? false,
        closes_at: Number.isFinite(closesAt) ? new Date(closesAt).toISOString() : null,
        yes_probability: probability,
        no_probability: noProbability,
      });
    }

    if (rows.length === 0) return { inserted: 0, cleaned: false };

    await withRetry(() => this.store.insertBucket(rows), this.retry);
    await withRetry(
      () => this.store.publishCurrentSnapshot(observedAt, snapshotRows),
      this.retry,
    );

    let cleaned = false;
    if (observedAtMs - this.lastCleanupAt >= this.cleanupIntervalMs) {
      const cutoff = new Date(observedAtMs - this.retentionMs).toISOString();
      await withRetry(() => this.store.deleteBefore(cutoff), this.retry);
      this.lastCleanupAt = observedAtMs;
      cleaned = true;
    }

    return { inserted: rows.length, cleaned };
  }
}
