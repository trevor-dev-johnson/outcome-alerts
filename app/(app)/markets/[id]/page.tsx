import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AlertForm } from "@/components/alert-form";
import { formatProbability } from "@/lib/format";
import { getProfile } from "@/lib/auth";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const [{ markets }, profile] = await Promise.all([getMarketsWithFallback(), getProfile()]);
  const market = markets.find((item) => item.id === id); if (!market) notFound();
  return <main className="app-main"><div className="shell">
    <Link href="/markets" className="eyebrow" style={{ display:"inline-flex", gap:8, alignItems:"center" }}><ArrowLeft size={13} /> All markets</Link>
    <div className="detail-grid"><section><p className="eyebrow">HIP-4 outcome · #{market.id}</p><h1 className="detail-question">{market.name}</h1>
      <div className="prob-pair"><div className="prob-hero"><span className="eyebrow">YES probability</span><strong>{formatProbability(market.yesPrice)}</strong></div><div className="prob-hero"><span className="eyebrow">NO probability</span><strong>{formatProbability(market.noPrice)}</strong></div></div>
      <p className="muted" style={{ fontSize:12, marginTop:14 }}>Live midpoint prices from Hyperliquid. Outcome prices are displayed as implied probabilities.</p>
    </section><AlertForm market={market} telegramConnected={Boolean(profile?.telegram_chat_id)} /></div>
  </div></main>;
}
