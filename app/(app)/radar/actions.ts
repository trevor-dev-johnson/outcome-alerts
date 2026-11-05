"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";
import { radarCategories, radarInput } from "@/lib/radar";
import { createClient } from "@/lib/supabase/server";

export type RadarFormState = { error?: string; success?: string };

export async function createRadarSubscription(_: RadarFormState, form: FormData): Promise<RadarFormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.preview) return { error: "Sign in to save a Radar subscription." };
  const value = radarInput.safeParse(Object.fromEntries(form));
  if (!value.success) return { error: "Choose a market or verified category, a window, 1–100 percentage points, and opt in to Telegram." };
  const snapshot = await getMarketsWithFallback();
  const v = value.data;
  if (snapshot.source !== "live" || !snapshot.markets.some((market) =>
    (!market.closesAt || Date.parse(market.closesAt) > Date.now()) &&
    (v.targetKind === "market" ? market.id === v.target : radarCategories(market).includes(v.target))))
    return { error: "Live market metadata is unavailable for this selection. Try again shortly." };
  const client = await createClient();
  // Caller identity is derived inside the RPC from auth.uid(), never from form input.
  const { error } = await client.rpc("create_radar_subscription", {
    p_kind: v.targetKind, p_target: v.target, p_window: v.window, p_threshold: v.threshold, p_consent: true,
  });
  if (error) return { error: "Could not save. Check for an existing follow for this window or the 20-subscription limit." };
  revalidatePath("/radar");
  return { success: "Follow saved. Notifications require connected Telegram and separately enabled Radar delivery." };
}

export async function manageRadarSubscription(_: RadarFormState, form: FormData): Promise<RadarFormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.preview) return { error: "Sign in to manage Radar." };
  const value = z.object({ id: z.uuid(), operation: z.enum(["pause", "resume", "remove"]) }).safeParse(Object.fromEntries(form));
  if (!value.success) return { error: "Invalid subscription action." };
  const client = await createClient();
  const { data, error } = await client.rpc("manage_radar_subscription", { p_id: value.data.id, p_operation: value.data.operation });
  if (error || !data) return { error: "Could not change this subscription. Refresh and try again." };
  revalidatePath("/radar");
  return { success: "Subscription updated. A notification already in flight may still arrive." };
}
