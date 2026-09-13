import { createHash } from "node:crypto";
import { Bot } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alert } from "@/lib/types";
import { formatProbability } from "@/lib/format";

export function createTelegramBot(token: string, supabase: SupabaseClient) {
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    const sender = ctx.from;
    if (!sender) { await ctx.reply("Telegram could not identify this account. Please try again."); return; }
    const connectionToken = ctx.match?.trim();
    if (!connectionToken) { await ctx.reply("Open oddsup settings first, then tap Connect Telegram."); return; }
    const tokenHash = createHash("sha256").update(connectionToken).digest("hex");
    const { data, error } = await supabase.rpc("consume_telegram_connection_token", {
      p_token_hash: tokenHash, p_telegram_user_id: String(sender.id), p_telegram_chat_id: String(ctx.chat.id), p_telegram_username: sender.username ?? null,
    });
    if (error || !data) { console.warn("telegram_connection_rejected", { telegramUserId: sender.id, error: error?.message }); await ctx.reply("This connection link is invalid or expired. Create a new one in oddsup settings."); return; }
    await ctx.reply("✅ Telegram connected. Your oddsup alerts will arrive here.");
  });
  bot.catch((error) => console.error("telegram_bot_error", { error: error.error instanceof Error ? error.error.message : String(error.error) }));
  return bot;
}

export async function sendAlert(bot: Bot, chatId: string, alert: Alert, currentPrice: number) {
  const direction = alert.operator === "above" ? "above" : "below";
  const text = ["🚨 oddsup alert", "", alert.market_name, "", `${alert.outcome} crossed ${direction} ${formatProbability(alert.threshold)}.`, `Current probability: ${formatProbability(currentPrice)}`].join("\n");
  await bot.api.sendMessage(chatId, text);
}
