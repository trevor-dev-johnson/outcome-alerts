import { Send, Unplug, LogOut } from "lucide-react";
import { getProfile, getViewer } from "@/lib/auth";
import { connectTelegram, disconnectTelegram, signOut } from "./actions";

export const dynamic = "force-dynamic"; export const metadata = { title:"Settings" };
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; connect?: string }> }) {
  const [profile, viewer, params] = await Promise.all([getProfile(), getViewer(), searchParams]);
  const connected = Boolean(profile?.telegram_chat_id);
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_USERNAME);
  return <main className="app-main"><div className="shell"><header className="page-head"><div><span className="eyebrow">Notification channel</span><h1>Settings</h1></div><p className="muted">Connect the Telegram account where you want crossing alerts delivered.</p></header>
    {params.error && <div className="notice danger">Could not start the Telegram connection. Check the server configuration and try again.</div>}
    {params.connect === "telegram" && !connected && telegramConfigured && <div className="notice signal">Your alert is saved. Connect Telegram to make sure you receive it.</div>}
    {params.connect === "telegram" && !connected && !telegramConfigured && <div className="notice danger">Your alert is saved, but Telegram delivery is still being configured. It will appear here as soon as the bot is ready.</div>}
    <section className={`settings-row ${params.connect === "telegram" && !connected ? "settings-row-focus" : ""}`}><div><span className="eyebrow">Notifications</span><h2>Telegram</h2></div><div className="connection"><span className="telegram-icon"><Send size={18}/></span><div><span className={`status ${connected?"status-active":"status-disabled"}`}>{connected?"Connected":"Not connected"}</span><div className="muted" style={{ marginTop:5, fontSize:13 }}>{connected ? `@${profile?.telegram_username ?? "Telegram user"}` : "Required to receive live alerts"}</div></div></div>
      {connected ? <form action={disconnectTelegram}><button className="btn btn-quiet"><Unplug size={14}/> Disconnect</button></form> : <form action={connectTelegram}><button className="btn btn-primary" disabled={viewer?.preview || !telegramConfigured}><Send size={14}/> {telegramConfigured ? "Connect Telegram" : "Setup pending"}</button></form>}</section>
    {viewer?.preview && <div className="notice">Telegram connection is disabled in preview mode. Add environment credentials to enable it.</div>}
    <section className="settings-row"><div><span className="eyebrow">Account</span><h2>Session</h2></div><div><div style={{ fontSize:14 }}>{viewer?.email}</div><div className="muted" style={{ fontSize:12, marginTop:4 }}>{viewer?.preview ? "Local preview account" : "Authenticated by Supabase"}</div></div><form action={signOut}><button className="btn btn-quiet"><LogOut size={14}/> Sign out</button></form></section>
  </div></main>;
}
