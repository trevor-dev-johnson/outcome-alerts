"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AlertStatus } from "@/lib/types";

async function updateAlert(formData: FormData, status: AlertStatus, reset = false) {
  const viewer = await getViewer(); if (!viewer || viewer.preview) return;
  const id = String(formData.get("id") ?? ""); if (!id) return;
  const supabase = await createClient();
  const update: Record<string, unknown> = { status };
  if (reset) { update.triggered_at = null; update.last_observed_price = null; }
  await supabase.from("alerts").update(update).eq("id", id).eq("user_id", viewer.id);
  revalidatePath("/alerts");
}
export async function disableAlert(formData: FormData) { await updateAlert(formData, "disabled"); }
export async function enableAlert(formData: FormData) { await updateAlert(formData, "active", true); }
export async function rearmAlert(formData: FormData) { await updateAlert(formData, "active", true); }
export async function deleteAlert(formData: FormData) {
  const viewer = await getViewer(); if (!viewer || viewer.preview) return;
  const supabase = await createClient(); await supabase.from("alerts").delete().eq("id", String(formData.get("id") ?? "")).eq("user_id", viewer.id); revalidatePath("/alerts");
}
