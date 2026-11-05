import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bucketStart, MOVER_WINDOW_RULES, type MarketProbabilityObservation, type MoverWindow } from "@/lib/movers";
import { RADAR_MAX_MARKETS, RADAR_MAX_SUBSCRIPTIONS, radarMatches, radarMovement, type RadarSubscription } from "@/lib/radar";
import type { Market } from "@/lib/types";
import { defaultSupabaseRetryOptions, withRetry, type RetryOptions } from "./retry";

type Candidate = {
  subscription: RadarSubscription;
  market: Market;
  current: MarketProbabilityObservation;
  baseline: MarketProbabilityObservation;
  points: number;
};
export interface RadarStore {
  subscriptions(): Promise<RadarSubscription[]>;
  observations(ids: string[], bucket: string, windows: MoverWindow[], now: number): Promise<{
    current: MarketProbabilityObservation[];
    history: Partial<Record<MoverWindow, MarketProbabilityObservation[]>>;
  }>;
  claim(candidate: Candidate, event: string): Promise<boolean>;
  begin(event: string): Promise<number | null>;
  finish(event: string, status: "sent" | "uncertain"): Promise<void>;
  prune(before: string): Promise<void>;
}

export function radarMessage(candidate: Candidate) {
  const { market, current, baseline, points, subscription } = candidate;
  return `oddsUp Radar · sampled ${subscription.window_name} movement\n${market.name.slice(0, 500)}\n`
    + `YES ${(Number(baseline.yes_probability) * 100).toFixed(1)}% → ${(Number(current.yes_probability) * 100).toFixed(1)}% (${points >= 0 ? "+" : ""}${points.toFixed(1)} percentage points)\n`
    + `Samples: ${baseline.observed_at} → ${current.observed_at}\nFive-minute observations, not tick-level activity.\n`
    + `https://oddsup.xyz/markets/${encodeURIComponent(market.id)}\nManage: https://oddsup.xyz/radar`;
}

export class RadarEngine {
  private stopped = false;
  private running: Promise<void> | null = null;
  private lastPrune = 0;
  private readonly retry: RetryOptions;
  constructor(
    private readonly store: RadarStore,
    private readonly send: (chat: number, text: string, signal: AbortSignal) => Promise<unknown>,
    private readonly enabled: boolean,
    private readonly now: () => number = Date.now,
    retry: Partial<RetryOptions> = {},
  ) { this.retry = { ...defaultSupabaseRetryOptions, ...retry }; }

  stop() { this.stopped = true; }
  run(markets: Market[]) {
    if (!this.enabled || this.stopped) return Promise.resolve();
    if (!this.running) this.running = this.cycle(markets).finally(() => { this.running = null; });
    return this.running;
  }
  private async cycle(markets: Market[]) {
    const started = this.now();
    if (markets.length > RADAR_MAX_MARKETS) throw new Error("radar_market_limit");
    const subscriptions = await withRetry(() => this.store.subscriptions(), this.retry);
    if (subscriptions.length > RADAR_MAX_SUBSCRIPTIONS) throw new Error("radar_subscription_limit");
    if (!this.stopped && this.now() - this.lastPrune >= 3_600_000) {
      await withRetry(() => this.store.prune(new Date(this.now() - 30 * 86_400_000).toISOString()), this.retry);
      this.lastPrune = this.now();
    }
    const eligible = markets.filter((m) => (!m.closesAt || Date.parse(m.closesAt) > started)
      && subscriptions.some((s) => radarMatches(s, m)));
    const ids = [...new Set(eligible.map((m) => m.id))].sort();
    if (!ids.length || this.stopped) return;
    const windows = [...new Set(subscriptions.filter((s) => !s.paused).map((s) => s.window_name))];
    // Load all required batches first. A failed batch cannot produce partial signals.
    const samples = await this.store.observations(ids, new Date(bucketStart(started)).toISOString(), windows, started);
    const current = new Map(samples.current.map((row) => [row.market_id, row]));
    const history = new Map(windows.map((w) => [w, new Map((samples.history[w] ?? []).map((r) => [r.market_id, r]))]));
    const candidates: Candidate[] = [];
    for (const subscription of subscriptions) for (const market of eligible) {
      if (!radarMatches(subscription, market)) continue;
      const c = current.get(market.id), b = history.get(subscription.window_name)?.get(market.id);
      if (!c || !b) continue;
      const points = radarMovement(c, b, subscription.window_name, this.now());
      if (points !== null && Math.abs(points) + 1e-9 >= Number(subscription.threshold_points))
        candidates.push({ subscription, market, current: c, baseline: b, points });
    }
    candidates.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || a.subscription.id.localeCompare(b.subscription.id) || a.market.id.localeCompare(b.market.id));
    let sent = 0;
    // Hard bounds on work per cycle; no backlog/replay of old price signals.
    for (const candidate of candidates.slice(0, 100)) {
      if (this.stopped || this.now() - started > 20_000) break;
      if (radarMovement(candidate.current, candidate.baseline, candidate.subscription.window_name, this.now()) === null) continue;
      const event = randomUUID();
      if (!await withRetry(() => this.store.claim(candidate, event), this.retry)) continue;
      if (this.stopped) break;
      // Deliberately no retry: a timeout can mean the send gate was consumed.
      const chat = await this.store.begin(event);
      if (chat === null || this.stopped) continue;
      let status: "sent" | "uncertain" = "sent";
      try {
        // No Telegram retry, including HTTP 429. Counts toward cooldown/rate cap.
        await this.send(chat, radarMessage(candidate), AbortSignal.timeout(8_000));
        sent += 1;
      } catch { status = "uncertain"; console.warn("radar_delivery_uncertain"); }
      await withRetry(() => this.store.finish(event, status), this.retry);
    }
    console.info("radar_cycle_completed", { candidates: candidates.length, sent });
  }
}

export function createRadarStore(client: SupabaseClient): RadarStore {
  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5_000));
    if (error) throw error;
    return data as T;
  }
  return {
    async subscriptions() {
      const { data, error, count } = await client.from("radar_subscriptions")
        .select("id,target_kind,target,window_name,threshold_points,generation,paused", { count: "exact" })
        .eq("paused", false).order("id").limit(RADAR_MAX_SUBSCRIPTIONS + 1).abortSignal(AbortSignal.timeout(5_000));
      if (error) throw error;
      // PostgREST can truncate at its server row cap even with limit(1001).
      if (count === null || count > RADAR_MAX_SUBSCRIPTIONS || count !== data?.length) throw new Error("radar_subscription_limit");
      return data ?? [];
    },
    async observations(ids, bucket, windows, now) {
      if (ids.length > RADAR_MAX_MARKETS) throw new Error("radar_market_limit");
      const current: MarketProbabilityObservation[] = [];
      const history: Partial<Record<MoverWindow, MarketProbabilityObservation[]>> = {};
      const jobs: (() => Promise<void>)[] = [];
      const deadline = Date.now() + 15_000;
      for (let i = 0; i < ids.length; i += 300) {
        const batch = ids.slice(i, i + 300);
        jobs.push(async () => {
          const { data, error } = await client.from("market_probability_observations")
            .select("market_id,bucket_at,observed_at,yes_probability").in("market_id", batch).eq("bucket_at", bucket)
            .abortSignal(AbortSignal.timeout(5_000));
          if (error) throw error;
          current.push(...data);
        });
        for (const window of windows) jobs.push(async () => {
          const rule = MOVER_WINDOW_RULES[window];
          const rows = await rpc<MarketProbabilityObservation[]>("closest_market_probability_observations", {
            p_market_ids: batch, p_target_at: new Date(now - rule.durationMs).toISOString(), p_tolerance_seconds: rule.toleranceMs / 1000,
          });
          (history[window] ??= []).push(...rows);
        });
      }
      for (let i = 0; i < jobs.length; i += 2)
        await Promise.all(jobs.slice(i, i + 2).map((job) => withRetry(() => {
          if (Date.now() >= deadline) throw new Error("radar_history_deadline");
          return job();
        }, defaultSupabaseRetryOptions)));
      return { current, history };
    },
    claim(c, event) { return rpc<boolean>("claim_radar_event", {
      p_subscription: c.subscription.id, p_generation: c.subscription.generation, p_market: c.market.id,
      p_current_bucket: c.current.bucket_at, p_baseline_bucket: c.baseline.bucket_at, p_event: event,
    }); },
    begin(event) { return rpc<number | null>("begin_radar_delivery", { p_event: event }); },
    finish(event, status) { return rpc<void>("finish_radar_delivery", { p_event: event, p_status: status }); },
    async prune(before) {
      const { error } = await client.from("radar_events").delete().lt("created_at", before).abortSignal(AbortSignal.timeout(5_000));
      if (error) throw error;
    },
  };
}
