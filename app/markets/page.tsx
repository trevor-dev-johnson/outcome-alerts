import type { Metadata } from "next";
import { MarketList } from "@/components/market-list";
import { PublicNav } from "@/components/public-nav";
import { getViewer } from "@/lib/auth";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Markets",
  robots: { index: false, follow: false, nocache: true },
};

export default async function MarketsPage() {
  const [{ markets, source }, viewer] = await Promise.all([
    getMarketsWithFallback(),
    getViewer(),
  ]);

  return <>
    <PublicNav authenticated={Boolean(viewer)} current="markets" />
    <main className="app-main"><div className="shell">
      <header className="page-head"><div><span className="eyebrow">Live probability feed</span><h1>Markets</h1></div><p className="muted">HIP-4 outcome markets. Prices refresh automatically from Hyperliquid.</p><div className="source-label eyebrow"><span className="status-dot" />{source === "live" ? "Live" : source === "stale" ? "Updating" : "Preview"}</div></header>
      <MarketList initialMarkets={markets} initialSource={source} />
    </div></main>
  </>;
}
