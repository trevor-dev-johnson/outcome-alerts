"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { clearLocalAuthState } from "@/lib/supabase/auth-state";
import { createClient } from "@/lib/supabase/server";

export async function connectTelegram() {
  const viewer = await getViewer(); if (!viewer || viewer.preview) return;
  const username = process.env.TELEGRAM_BOT_USERNAME; if (!username) redirect("/settings?error=telegram-config");
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.from("telegram_connection_tokens").insert({ id: randomUUID(), user_id: viewer.id, token_hash: tokenHash, expires_at: new Date(Date.now()+10*60_000).toISOString() });
  if (error) redirect("/settings?error=token");
  redirect(`https://t.me/${username}?start=${token}`);
}

export async function disconnectTelegram() {
  const viewer = await getViewer(); if (!viewer || viewer.preview) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("disconnect_telegram");
  if (error || data !== true) redirect("/settings?error=telegram-disconnect");
  revalidatePath("/settings");
}

export async function signOut() {
  if (!hasSupabaseEnv()) redirect("/");
  const supabase = await createClient();
  await clearLocalAuthState(supabase, await cookies());
  redirect("/");
}
