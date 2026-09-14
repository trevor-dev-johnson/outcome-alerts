import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bot } from "grammy";
import { didCrossThreshold } from "@/lib/alerts/evaluate";
import type { Alert } from "@/lib/types";
import { sendAlert } from "./telegram";

type WatchedAlert = Alert & { telegram_chat_id: string | null };

function coinFor(alert: Alert) {
  const side = alert.outcome === "YES" ? 0 : 1;
  return `#${Number(alert.market_id) * 10 + side}`;
}

export class AlertEvaluator {
  private alerts = new Map<string, WatchedAlert>();
  private lastPersisted = new Map<string, number>();

  constructor(private readonly supabase: SupabaseClient, private readonly bot: Bot) {}

  async refresh() {
    const { data, error } = await this.supabase.from("alerts").select("*").eq("status", "active");
    if (error) throw error;

    const alerts = (data ?? []) as Alert[];
    const userIds = [...new Set(alerts.map((alert) => alert.user_id))];
    const chatIds = new Map<string, string>();

    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await this.supabase
        .from("profiles")
        .select("id, telegram_chat_id")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      for (const profile of profiles ?? []) {
        if (profile.telegram_chat_id != null) {
          chatIds.set(profile.id, String(profile.telegram_chat_id));
        }
      }
    }

    const next = new Map<string, WatchedAlert>();
    for (const alert of alerts) {
      next.set(alert.id, { ...alert, telegram_chat_id: chatIds.get(alert.user_id) ?? null });
    }
    this.alerts = next;
    return new Set([...next.values()].map(coinFor).filter((coin) => !coin.includes("NaN")));
  }

  async onPrice(coin: string, currentPrice: number) {
    const matching = [...this.alerts.values()].filter((alert) => coinFor(alert) === coin);
    await Promise.allSettled(matching.map((alert) => this.evaluateOne(alert, currentPrice)));
  }

  private async evaluateOne(alert: WatchedAlert, currentPrice: number) {
    const previousPrice = alert.last_observed_price;
    const crossed = didCrossThreshold({ operator: alert.operator, previousPrice, currentPrice, threshold: alert.threshold });
    if (crossed && alert.telegram_chat_id) {
      try {
        await sendAlert(this.bot, alert.telegram_chat_id, alert, currentPrice);
        const { error } = await this.supabase.from("alerts").update({ status:"triggered", triggered_at:new Date().toISOString(), last_observed_price:currentPrice }).eq("id", alert.id).eq("status", "active");
        if (error) throw error;
        this.alerts.delete(alert.id);
        console.info("alert_triggered", { alertId:alert.id, marketId:alert.market_id, currentPrice });
        return;
      } catch (error) {
        console.error("alert_notification_failed", { alertId:alert.id, marketId:alert.market_id, error:error instanceof Error ? error.message : String(error) });
        return;
      }
    }
    alert.last_observed_price = currentPrice;
    const now = Date.now();
    if (now - (this.lastPersisted.get(alert.id) ?? 0) > 5_000) {
      this.lastPersisted.set(alert.id, now);
      const { error } = await this.supabase.from("alerts").update({ last_observed_price:currentPrice }).eq("id",alert.id).eq("status","active");
      if (error) console.error("alert_baseline_update_failed", { alertId:alert.id, error:error.message });
    }
  }
}
