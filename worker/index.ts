import { createClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";
import { fetchMarkets } from "@/lib/hyperliquid/client";
import { OBSERVATION_BUCKET_MS } from "@/lib/movers";
import { AlertEvaluator } from "./alerts";
import { getAlertSyncInterval } from "./config";
import { HyperliquidStream } from "./hyperliquid";
import { MarketHistoryRecorder, createSupabaseMarketHistoryStore } from "./history";
import { createTelegramBot } from "./telegram";

const supabase = createClient(requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"), requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth:{ persistSession:false, autoRefreshToken:false } });
const bot = createTelegramBot(requireServerEnv("TELEGRAM_BOT_TOKEN"), supabase);
const evaluator = new AlertEvaluator(supabase, bot);
const history = new MarketHistoryRecorder(createSupabaseMarketHistoryStore(supabase), fetchMarkets);
const stream = new HyperliquidStream(process.env.HYPERLIQUID_WS_URL ?? "wss://api.hyperliquid.xyz/ws", (coin, price) => evaluator.onPrice(coin, price));
const syncInterval = getAlertSyncInterval();
const historyInterval = OBSERVATION_BUCKET_MS;

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    try { return JSON.stringify(error); }
    catch { return "Unknown object error"; }
  }
  return String(error);
}

async function syncAlerts() {
  try { stream.setCoins(await evaluator.refresh()); }
  catch (error) { console.error("alert_sync_failed", { error:describeError(error) }); }
}

async function syncMarketHistory() {
  try {
    const result = await history.record();
    console.info("market_history_recorded", result);
  } catch (error) {
    console.error("market_history_failed", { error:describeError(error) });
  }
}

async function main() {
  await Promise.all([syncAlerts(), syncMarketHistory()]); stream.start();
  const interval = setInterval(syncAlerts, syncInterval);
  const historyTimer = setInterval(syncMarketHistory, historyInterval);
  void bot.start({ onStart:({ username }) => console.info("telegram_bot_started", { username }) });
  const shutdown = () => { console.info("worker_stopping"); clearInterval(interval); clearInterval(historyTimer); stream.stop(); bot.stop(); process.exit(0); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
}

main().catch((error) => { console.error("worker_start_failed", { error:describeError(error) }); process.exit(1); });
