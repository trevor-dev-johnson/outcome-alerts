import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { hasSupabaseEnv } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}) {
  const preview = !hasSupabaseEnv();
  const { error, next: requestedNext } = await searchParams;
  const next = safeInternalPath(typeof requestedNext === "string" ? requestedNext : null);
  return (
    <main className="auth-page"><section className="auth-box">
      <Brand />
      <p className="eyebrow" style={{ marginTop:42 }}>Access your alerts</p>
      <h1>Sign in.</h1>
      <p>We’ll email you a secure link. No password required.</p>
      {(error === "auth" || error === "session-expired") && (
        <div className="notice">This sign-in link was opened in a different browser or has expired. Request a new link and open it in the same browser where you started signing in.</div>
      )}
      {preview && <div className="notice">Local preview mode · Supabase credentials are not configured.</div>}
      <LoginForm next={next} preview={preview} />
      <p style={{ textAlign:"center", marginTop:24 }}><Link href="/" className="muted">Back to home</Link></p>
    </section></main>
  );
}
