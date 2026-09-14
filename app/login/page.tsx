import Link from "next/link";
import { Brand } from "@/components/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const preview = !hasSupabaseEnv();
  const { error } = await searchParams;
  return (
    <main className="auth-page"><section className="auth-box">
      <Brand />
      <p className="eyebrow" style={{ marginTop:42 }}>Access your alerts</p>
      <h1>Sign in.</h1>
      <p>We’ll email you a secure link. No password required.</p>
      {error === "auth" && <div className="notice">That sign-in link is invalid or expired. Request a new one.</div>}
      {preview && <div className="notice">Local preview mode · Supabase credentials are not configured.</div>}
      <LoginForm preview={preview} />
      <p style={{ textAlign:"center", marginTop:24 }}><Link href="/" className="muted">Back to home</Link></p>
    </section></main>
  );
}
