import { MarketList } from "@/components/market-list";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Markets" };
export default async function MarketsPage() {
  const { markets, source } = await getMarketsWithFallback();
  return <main className="app-main"><div className="shell">
    <header className="page-head"><div><span className="eyebrow">Live probability feed</span><h1>Markets</h1></div><p className="muted">HIP-4 outcome markets. Prices refresh automatically from Hyperliquid.</p><div className="source-label eyebrow"><span className="status-dot" />{source === "live" ? "Live" : "Preview"}</div></header>
    <MarketList initialMarkets={markets} initialSource={source} />
  </div></main>;
}
