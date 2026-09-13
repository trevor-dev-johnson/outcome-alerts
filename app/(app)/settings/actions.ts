"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
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
  await supabase.from("profiles").update({ telegram_user_id:null, telegram_chat_id:null, telegram_username:null, telegram_connected_at:null }).eq("id", viewer.id);
  revalidatePath("/settings");
}

export async function signOut() {
  const viewer = await getViewer(); if (!viewer || viewer.preview) redirect("/");
  const supabase = await createClient(); await supabase.auth.signOut(); redirect("/");
}
