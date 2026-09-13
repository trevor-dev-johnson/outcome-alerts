import Link from "next/link";
import { Brand } from "@/components/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };
export default function LoginPage() {
  const preview = !hasSupabaseEnv();
  return (
    <main className="auth-page"><section className="auth-box">
      <Brand />
      <p className="eyebrow" style={{ marginTop:42 }}>Access your alerts</p>
      <h1>Sign in.</h1>
      <p>We’ll email you a secure link. No password required.</p>
      {preview && <div className="notice">Local preview mode · Supabase credentials are not configured.</div>}
      <LoginForm preview={preview} />
      <p style={{ textAlign:"center", marginTop:24 }}><Link href="/" className="muted">Back to home</Link></p>
    </section></main>
  );
}
