import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";
import { radarCategories, type RadarSubscription } from "@/lib/radar";
import { createClient } from "@/lib/supabase/server";
import { RadarCreateForm, RadarManageForm } from "./forms";
import styles from "./radar.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Radar", robots: { index: false, follow: false } };

export default async function RadarPage() {
  const { viewer, profile } = await getAuthContext();
  if (!viewer) redirect("/login?next=/radar");
  const snapshot = await getMarketsWithFallback();
  let subscriptions: RadarSubscription[] = [];
  let unavailable = false;
  if (!viewer.preview) {
    const client = await createClient();
    const { data, error } = await client.from("radar_subscriptions")
      .select("id,target_kind,target,window_name,threshold_points,generation,paused")
      .eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(20);
    unavailable = Boolean(error);
    subscriptions = data ?? [];
  }
  const markets = snapshot.markets.filter((m) => !m.closesAt || Date.parse(m.closesAt) > Date.parse(snapshot.fetchedAt));
  const names = new Map(markets.map((m) => [m.id, m.name]));
  const categories = [...new Set(markets.flatMap(radarCategories))].sort();
  return <main className="app-main"><div className="shell">
    <header className="page-head"><div><span className="eyebrow">Sampled probability monitoring</span><h1>Radar</h1></div><p className="muted">Follow markets and verified leagues. Keep your existing one-shot alerts unchanged.</p></header>
    <div className="notice">Radar delivery is disabled by default and requires separate operator approval. Saving a follow is not a delivery guarantee. Maximum 20 follows; at most one notification per follow per hour and six per account per hour.</div>
    {!profile?.telegram_chat_id && <p className="notice"><Link href="/settings">Connect Telegram in Settings</Link> before receiving Radar notifications.</p>}
    {viewer.preview && <p className="notice">Local preview: sign-in and database configuration are required to save follows.</p>}
    {unavailable && <p className="notice danger">Radar storage is unavailable. Existing alerts are unaffected.</p>}
    {snapshot.source !== "live" && <p className="notice">Market data is updating. New follows are temporarily unavailable.</p>}
    <div className={styles.layout}>
      <RadarCreateForm markets={markets.map(({ id, name }) => ({ id, name }))} categories={categories} disabled={viewer.preview || unavailable || snapshot.source !== "live"} />
      <section className={styles.list} aria-labelledby="radar-follows"><h2 id="radar-follows">Your follows</h2>
        {!subscriptions.length && !unavailable && <p className="muted">No follows yet.</p>}
        {subscriptions.map((s) => <article className={styles.follow} key={s.id}>
          <h3>{s.target_kind === "category" ? `${s.target} markets` : names.get(s.target) ?? `Market #${s.target}`}</h3>
          <p>{s.threshold_points} pp · {s.window_name} · {s.paused ? "Paused" : "Following"}</p>
          <p className="muted">Signals require fresh observations at both ends of the window. No backfill or catch-up delivery.</p>
          {s.target_kind === "market" && <Link href={`/markets/${encodeURIComponent(s.target)}`}>View market ↗</Link>}
          <RadarManageForm subscription={s} />
        </article>)}
      </section>
    </div>
  </div></main>;
}
