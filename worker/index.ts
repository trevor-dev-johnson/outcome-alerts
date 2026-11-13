import { createClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";
import { fetchMarkets } from "@/lib/hyperliquid/client";
import { OBSERVATION_BUCKET_MS } from "@/lib/movers";
import { AlertEvaluator } from "./alerts";
import { getAlertSyncInterval, getRadarDeliveryConfig, getWorkerShutdownTimeout } from "./config";
import { HyperliquidStream } from "./hyperliquid";
import { MarketHistoryRecorder, createSupabaseMarketHistoryStore } from "./history";
import { WorkerRuntime } from "./runtime";
import { createTelegramBot } from "./telegram";
import type { Market } from "@/lib/types";
import { RadarEngine, createRadarStore } from "./radar";

const supabase = createClient(requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"), requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth:{ persistSession:false, autoRefreshToken:false } });
const bot = createTelegramBot(requireServerEnv("TELEGRAM_BOT_TOKEN"), supabase);
const evaluator = new AlertEvaluator(supabase, bot);
const radarConfig = getRadarDeliveryConfig();
const radarOn = radarConfig.enabled;
let recordedMarkets: Market[] = [];
const radar = radarOn ? new RadarEngine(createRadarStore(supabase),
  // grammY's Node typings use the older AbortController shim; its runtime
  // accepts the standard addEventListener/removeEventListener AbortSignal API.
  (chat, text, signal) => bot.api.sendMessage(chat, text, { link_preview_options: { is_disabled: true } },
    signal as unknown as Parameters<typeof bot.api.sendMessage>[3]), true, Date.now, {},
  radarConfig.mode === "canary" ? { mode: "canary", userIds: radarConfig.userIds } : { mode: "global" }) : null;
const history = new MarketHistoryRecorder(createSupabaseMarketHistoryStore(supabase), radarOn ? async () => {
  recordedMarkets = await fetchMarkets();
  return recordedMarkets;
} : fetchMarkets);
const stream = new HyperliquidStream(process.env.HYPERLIQUID_WS_URL ?? "wss://api.hyperliquid.xyz/ws", (coin, price) => evaluator.onPrice(coin, price));
const syncInterval = getAlertSyncInterval();
const historyInterval = OBSERVATION_BUCKET_MS;
const runtime = new WorkerRuntime(evaluator, stream, history, bot, {
  alertSyncIntervalMs: syncInterval,
  historyIntervalMs: historyInterval,
  shutdownTimeoutMs: getWorkerShutdownTimeout(),
  radar: radar ? { run: () => radar.run(recordedMarkets), stop: () => radar.stop() } : undefined,
});

async function main() {
  process.once("SIGINT", () => { void runtime.requestShutdown("SIGINT"); });
  process.once("SIGTERM", () => { void runtime.requestShutdown("SIGTERM"); });
  await runtime.start();
}

main().catch((error) => {
  console.error("worker_start_failed", { error:error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
