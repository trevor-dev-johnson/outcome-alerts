"use client";

import { useActionState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ preview }: { preview: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {});
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <div style={{ position: "relative" }}><Mail size={16} style={{ position:"absolute", left:14, top:15, color:"var(--muted)" }} /><input className="text-input" style={{ paddingLeft:42 }} id="email" name="email" type="email" placeholder="you@example.com" required /></div>
      </div>
      {state.error && <p className="message danger" role="alert">{state.error}</p>}
      {state.message && <p className="message" role="status">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending}>{pending ? "Sending…" : <>Send magic link <ArrowRight size={16} /></>}</button>
      {preview && <Link href="/markets" className="btn btn-quiet">Open preview</Link>}
    </form>
  );
}
