"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { message?: string; error?: string };

export async function sendMagicLink(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = z.string().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  if (!hasSupabaseEnv()) return { message: "Preview mode is active. Open Markets to explore the interface." };
  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data, options: { emailRedirectTo: `${appUrl}/auth/callback?next=/markets` } });
  if (error) return { error: error.message };
  return { message: "Magic link sent. Check your inbox." };
}

export async function previewApp() { redirect("/markets"); }
