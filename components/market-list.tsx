"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { formatProbability } from "@/lib/format";
import type { Market } from "@/lib/types";

export function MarketList({ initialMarkets, initialSource }: { initialMarkets: Market[]; initialSource: "live" | "preview" }) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [source, setSource] = useState(initialSource);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const refresh = async () => {
      try { const response = await fetch("/api/markets"); const data = await response.json(); setMarkets(data.markets); setSource(data.source); } catch { /* retain last known snapshot */ }
    };
    const id = window.setInterval(refresh, 8_000);
    return () => window.clearInterval(id);
  }, []);
  const visible = useMemo(() => markets.filter((m) => m.name.toLowerCase().includes(query.toLowerCase())), [markets, query]);
  return <>
    <div className="searchbar"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter markets…" aria-label="Filter markets" /><span className="eyebrow">{visible.length} markets</span></div>
    {source === "preview" && <div className="notice">Preview data is shown while live Hyperliquid outcome metadata is unavailable.</div>}
    <div className="market-list">
      {visible.map((market) => <article className="market-row" key={market.id}>
        <div><div className="market-meta"><span>{market.category ?? "HIP-4"}</span><span>#{market.id}</span></div><Link href={`/markets/${market.id}`} className="market-title">{market.name}</Link></div>
        <div className="prob prob-yes"><span className="prob-label">YES</span><span className="prob-value live-pulse">{formatProbability(market.yesPrice)}</span></div>
        <div className="prob"><span className="prob-label">NO</span><span className="prob-value">{formatProbability(market.noPrice)}</span></div>
        <Link href={`/markets/${market.id}`} className="btn btn-quiet">Set alert <ArrowUpRight size={14} /></Link>
      </article>)}
      {!visible.length && <div className="empty">No markets match “{query}”.</div>}
    </div>
  </>;
}
