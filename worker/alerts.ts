import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bot } from "grammy";
import { didCrossThreshold } from "@/lib/alerts/evaluate";
import type { Alert } from "@/lib/types";
import { defaultSupabaseRetryOptions, type RetryOptions, withRetry } from "./retry";
import { sendAlert } from "./telegram";

const BASELINE_CHECKPOINT_MS = 5 * 60_000;
const BASELINE_RETRY_COOLDOWN_MS = 30_000;

interface AlertEvaluatorOptions {
  retry?: Partial<RetryOptions>;
  baselineCheckpointMs?: number;
  baselineRetryCooldownMs?: number;
  now?: () => number;
  createClaimId?: () => string;
}
function coinFor(alert: Alert) {
  const side = alert.outcome === "YES" ? 0 : 1;
  return `#${Number(alert.market_id) * 10 + side}`;
}

function isAtOrPastThreshold(alert: Alert, price: number) {
  return alert.operator === "above" ? price >= alert.threshold : price <= alert.threshold;
}

export class AlertEvaluator {
  private alerts = new Map<string, Alert>();
  private persistedBaselines = new Map<string, number | null>();
  private lastCheckpoint = new Map<string, number>();
  private nextBaselineAttempt = new Map<string, number>();
  private readonly retry: RetryOptions;
  private readonly baselineCheckpointMs: number;
  private readonly baselineRetryCooldownMs: number;
  private readonly now: () => number;
  private readonly createClaimId: () => string;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly bot: Bot,
    options: AlertEvaluatorOptions = {},
  ) {
    this.retry = { ...defaultSupabaseRetryOptions, ...options.retry };
    this.baselineCheckpointMs = options.baselineCheckpointMs ?? BASELINE_CHECKPOINT_MS;
    this.baselineRetryCooldownMs = options.baselineRetryCooldownMs ?? BASELINE_RETRY_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
    this.createClaimId = options.createClaimId ?? randomUUID;
  }

  private async request<T>(name: string, operation: () => PromiseLike<{ data: T; error: unknown }>) {
    return withRetry(async () => {
      const { data, error } = await operation();
      if (error) throw error;
      return data;
    }, {
      ...this.retry,
      onRetry: (error, attempt, delayMs) => {
        this.retry.onRetry?.(error, attempt, delayMs);
        console.warn("supabase_retry", { operation: name, attempt, delayMs });
      },
    });
  }

  async refresh() {
    const data = await this.request("alerts_refresh", () =>
      this.supabase.from("alerts").select("*").eq("status", "active"),
    );
    const alerts = (data ?? []) as Alert[];
    const alertIds = alerts.map((alert) => alert.id);
    const claimedIds = new Set<string>();

    if (alertIds.length > 0) {
      const claims = await this.request("delivery_claims_refresh", () =>
        this.supabase.from("alert_delivery_claims").select("alert_id").in("alert_id", alertIds),
      );
      for (const claim of claims ?? []) claimedIds.add(String(claim.alert_id));
    }

    const next = new Map<string, Alert>();
    const nextPersistedBaselines = new Map<string, number | null>();
    for (const alert of alerts) {
      if (claimedIds.has(alert.id)) continue;
      const existing = this.alerts.get(alert.id);
      next.set(alert.id, {
        ...alert,
        last_observed_price: existing?.last_observed_price ?? alert.last_observed_price,
      });
      nextPersistedBaselines.set(alert.id, alert.last_observed_price);
      if (!this.lastCheckpoint.has(alert.id)) {
        this.lastCheckpoint.set(alert.id, alert.last_observed_price == null ? 0 : this.now());
      }
    }

    this.alerts = next;
    this.persistedBaselines = nextPersistedBaselines;
    for (const id of this.lastCheckpoint.keys()) if (!next.has(id)) this.lastCheckpoint.delete(id);
    for (const id of this.nextBaselineAttempt.keys()) if (!next.has(id)) this.nextBaselineAttempt.delete(id);
    return new Set([...next.values()].map(coinFor).filter((coin) => !coin.includes("NaN")));
  }

  async onPrice(coin: string, currentPrice: number) {
    const matching = [...this.alerts.values()].filter((alert) => coinFor(alert) === coin);
    await Promise.allSettled(matching.map((alert) => this.evaluateOne(alert, currentPrice)));
  }

  private async evaluateOne(alert: Alert, currentPrice: number) {
    const previousPrice = alert.last_observed_price;
    const crossed = didCrossThreshold({ operator: alert.operator, previousPrice, currentPrice, threshold: alert.threshold });

    if (crossed) {
      const claimId = this.createClaimId();
      try {
        const chatId = await this.request("alert_delivery_claim", () =>
          this.supabase.rpc("claim_alert_delivery", {
            p_alert_id: alert.id,
            p_claim_id: claimId,
            p_current_price: currentPrice,
          }),
        );

        if (chatId != null) {
          this.alerts.delete(alert.id);
          await sendAlert(this.bot, String(chatId), alert, currentPrice);
          const completed = await this.request("alert_delivery_complete", () =>
            this.supabase.rpc("complete_alert_delivery", {
              p_alert_id: alert.id,
              p_claim_id: claimId,
            }),
          );
          if (!completed) throw new Error("The delivery claim could not be completed.");
          console.info("alert_triggered", { alertId:alert.id, marketId:alert.market_id, currentPrice });
          return;
        }
      } catch (error) {
        this.alerts.delete(alert.id);
        console.error("alert_delivery_uncertain", { alertId:alert.id, marketId:alert.market_id, error:error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    alert.last_observed_price = currentPrice;
    const now = this.now();
    if (now < (this.nextBaselineAttempt.get(alert.id) ?? 0)) return;

    const persisted = this.persistedBaselines.get(alert.id) ?? null;
    const changedSide = persisted == null || isAtOrPastThreshold(alert, persisted) !== isAtOrPastThreshold(alert, currentPrice);
    const checkpointDue = now - (this.lastCheckpoint.get(alert.id) ?? 0) >= this.baselineCheckpointMs;
    if (!changedSide && !checkpointDue) return;

    if (!changedSide && persisted === currentPrice) {
      this.lastCheckpoint.set(alert.id, now);
      return;
    }

    try {
      await this.request("alert_baseline_update", () =>
        this.supabase.from("alerts").update({ last_observed_price:currentPrice }).eq("id",alert.id).eq("status","active"),
      );
      this.persistedBaselines.set(alert.id, currentPrice);
      this.lastCheckpoint.set(alert.id, now);
      this.nextBaselineAttempt.delete(alert.id);
    } catch (error) {
      this.nextBaselineAttempt.set(alert.id, now + this.baselineRetryCooldownMs);
      console.error("alert_baseline_update_failed", { alertId:alert.id, error:error instanceof Error ? error.message : String(error) });
    }
  }
}
