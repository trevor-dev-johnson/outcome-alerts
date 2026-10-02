import type { Bot } from "grammy";
import { describe, expect, it, vi } from "vitest";
import type { Alert } from "@/lib/types";
import { sendAlert } from "./telegram";

function alert(marketId: string, outcome: Alert["outcome"] = "YES"): Alert {
  return {
    id: "alert-1",
    user_id: "user-1",
    market_id: marketId,
    market_name: "Will the test pass?",
    outcome,
    operator: "above",
    threshold: 0.5,
    status: "active",
    last_observed_price: 0.4,
    triggered_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

describe("sendAlert", () => {
  it("includes the official Hyperliquid trade button for a valid HIP-4 market", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 1 }));
    const bot = { api: { sendMessage } } as unknown as Bot;

    await sendAlert(bot, "123", alert("1473"), 0.61);

    expect(sendMessage).toHaveBeenCalledWith("123", expect.stringContaining("Will the test pass?"), {
      reply_markup: {
        inline_keyboard: [[{
          text: "Trade on Hyperliquid",
          url: "https://app.hyperliquid.xyz/trade/%2314730",
        }]],
      },
    });
  });

  it("still sends the alert without a button when the market cannot be mapped", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 1 }));
    const bot = { api: { sendMessage } } as unknown as Bot;

    await sendAlert(bot, "123", alert("not-a-market"), 0.61);

    expect(sendMessage).toHaveBeenCalledWith("123", expect.stringContaining("Will the test pass?"));
  });

  it("links a NO alert to the corresponding NO outcome asset", async () => {
    const sendMessage = vi.fn(async () => ({ message_id: 1 }));
    const bot = { api: { sendMessage } } as unknown as Bot;

    await sendAlert(bot, "123", alert("1473", "NO"), 0.39);

    expect(sendMessage).toHaveBeenCalledWith("123", expect.any(String), {
      reply_markup: {
        inline_keyboard: [[expect.objectContaining({
          url: "https://app.hyperliquid.xyz/trade/%2314731",
        })]],
      },
    });
  });
});
