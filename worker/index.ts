import { createClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";
import { fetchMarkets } from "@/lib/hyperliquid/client";
import { OBSERVATION_BUCKET_MS } from "@/lib/movers";
import { AlertEvaluator } from "./alerts";
import { getAlertSyncInterval, getWorkerShutdownTimeout } from "./config";
import { HyperliquidStream } from "./hyperliquid";
import { MarketHistoryRecorder, createSupabaseMarketHistoryStore } from "./history";
import { WorkerRuntime } from "./runtime";
import { createTelegramBot } from "./telegram";

const supabase = createClient(requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"), requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth:{ persistSession:false, autoRefreshToken:false } });
const bot = createTelegramBot(requireServerEnv("TELEGRAM_BOT_TOKEN"), supabase);
const evaluator = new AlertEvaluator(supabase, bot);
const history = new MarketHistoryRecorder(createSupabaseMarketHistoryStore(supabase), fetchMarkets);
const stream = new HyperliquidStream(process.env.HYPERLIQUID_WS_URL ?? "wss://api.hyperliquid.xyz/ws", (coin, price) => evaluator.onPrice(coin, price));
const syncInterval = getAlertSyncInterval();
const historyInterval = OBSERVATION_BUCKET_MS;
const runtime = new WorkerRuntime(evaluator, stream, history, bot, {
  alertSyncIntervalMs: syncInterval,
  historyIntervalMs: historyInterval,
  shutdownTimeoutMs: getWorkerShutdownTimeout(),
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
