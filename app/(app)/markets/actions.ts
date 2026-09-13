"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AlertFormState = {
  error?: string;
  success?: string;
  alertId?: string;
  needsTelegram?: boolean;
};
const schema = z.object({
  marketId: z.string().min(1).max(120), marketName: z.string().min(1).max(500),
  outcome: z.enum(["YES", "NO"]), operator: z.enum(["above", "below"]),
  threshold: z.coerce.number().min(0.1).max(99.9), currentPrice: z.coerce.number().min(0).max(1).nullable(),
});

export async function createAlert(_: AlertFormState, formData: FormData): Promise<AlertFormState> {
  const parsed = schema.safeParse({
    marketId: formData.get("marketId"), marketName: formData.get("marketName"), outcome: formData.get("outcome"),
    operator: formData.get("operator"), threshold: formData.get("threshold"),
    currentPrice: formData.get("currentPrice") ? formData.get("currentPrice") : null,
  });
  if (!parsed.success) return { error: "Check the alert values and use a threshold between 0.1% and 99.9%." };
  const viewer = await getViewer();
  if (!viewer) return { error: "Sign in to create an alert." };
  if (viewer.preview) return {
    success: "Preview alert created locally. Configure Supabase to persist it.",
    alertId: "preview-alert",
    needsTelegram: true,
  };
  const supabase = await createClient();
  const value = parsed.data;
  const { data: alert, error } = await supabase.from("alerts").insert({
    user_id: viewer.id, market_id: value.marketId, market_name: value.marketName,
    outcome: value.outcome, operator: value.operator, threshold: value.threshold / 100,
    status: "active", last_observed_price: value.currentPrice,
  }).select("id").single();
  if (error) return { error: error.message };
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", viewer.id)
    .maybeSingle();
  revalidatePath("/alerts");
  return {
    success: profile?.telegram_chat_id
      ? "Alert armed. We’ll notify you when the probability crosses your threshold."
      : "Alert saved. Connect Telegram to receive this notification.",
    alertId: alert.id,
    needsTelegram: !profile?.telegram_chat_id,
  };
}
