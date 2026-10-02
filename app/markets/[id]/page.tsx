import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { AlertForm } from "@/components/alert-form";
import { PublicNav } from "@/components/public-nav";
import { formatProbability } from "@/lib/format";
import { getAuthContext } from "@/lib/auth";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ markets }, { viewer, profile }] = await Promise.all([
    getMarketsWithFallback(),
    getAuthContext(),
  ]);
  const market = markets.find((item) => item.id === id);
  if (!market) notFound();
  const loginHref = `/login?next=${encodeURIComponent(`/markets/${market.id}`)}`;

  return <>
    <PublicNav />
    <main className="app-main"><div className="shell">
      <Link href="/movers" className="eyebrow" style={{ display:"inline-flex", gap:8, alignItems:"center" }}><ArrowLeft size={13} /> Back to movers</Link>
      <div className="detail-grid"><section><p className="eyebrow">HIP-4 outcome · #{market.id}</p><h1 className="detail-question">{market.name}</h1>
        <div className="prob-pair"><div className="prob-hero"><span className="eyebrow">YES probability</span><strong>{formatProbability(market.yesPrice)}</strong></div><div className="prob-hero"><span className="eyebrow">NO probability</span><strong>{formatProbability(market.noPrice)}</strong></div></div>
        <p className="muted" style={{ fontSize:12, marginTop:14 }}>Live midpoint prices from Hyperliquid. Outcome prices are displayed as implied probabilities.</p>
      </section>{viewer
        ? <AlertForm market={market} telegramConnected={Boolean(profile?.telegram_chat_id)} />
        : <aside className="form-panel">
            <p className="eyebrow">New probability alert</p>
            <h2>Sign in to create alert</h2>
            <p className="muted">Sign in to choose a probability crossing and receive the alert through Telegram.</p>
            <Link className="btn btn-primary" href={loginHref}>Sign in to create alert</Link>
          </aside>}
      </div>
    </div></main>
  </>;
}
