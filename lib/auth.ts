import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Alert, Profile } from "@/lib/types";

export async function getViewer() {
  if (!hasSupabaseEnv()) return { id: "preview-user", email: "preview@oddsup.local", preview: true };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "", preview: false } : null;
}

export async function getProfile(): Promise<Profile | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.preview) return { id: viewer.id, telegram_user_id: null, telegram_chat_id: null, telegram_username: null, telegram_connected_at: null, created_at: new Date().toISOString() };
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", viewer.id).maybeSingle();
  return data as Profile | null;
}

export async function getAlerts(): Promise<Alert[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  if (viewer.preview) return [
    { id: "preview-1", user_id: viewer.id, market_id: "1042", market_name: "Will BTC trade above $150,000 by December 31?", outcome: "YES", operator: "above", threshold: .7, status: "active", last_observed_price: .714, triggered_at: null, created_at: new Date(Date.now()-86400000).toISOString(), updated_at: new Date().toISOString() },
    { id: "preview-2", user_id: viewer.id, market_id: "1059", market_name: "Will SOL close the month above $250?", outcome: "NO", operator: "below", threshold: .75, status: "triggered", last_observed_price: .709, triggered_at: new Date(Date.now()-3600000).toISOString(), created_at: new Date(Date.now()-172800000).toISOString(), updated_at: new Date().toISOString() },
  ];
  const supabase = await createClient();
  const { data } = await supabase.from("alerts").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Alert[];
}
