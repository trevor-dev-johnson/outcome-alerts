"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { formatProbability } from "@/lib/format";
import type { Market, MarketCategory, MarketSource } from "@/lib/types";

const MARKET_FRESHNESS_WINDOW_MS = 60_000;
const CATEGORY_ORDER: MarketCategory[] = ["Sports", "Crypto", "Economics", "Business", "Other"];
export const MISSING_VENUE_FILTER = "__missing__";
export const PROTOCOL_NATIVE_VENUE_FILTER = "__protocol_native__";
export type MarketSort = "default" | "yes-high" | "yes-low";

export interface MarketDiscoveryOptions {
  query: string;
  category: "all" | MarketCategory;
  venue: "all" | string;
  sort: MarketSort;
}

export const DEFAULT_MARKET_DISCOVERY_OPTIONS: MarketDiscoveryOptions = {
  query: "",
  category: "all",
  venue: "all",
  sort: "default",
};

const VERIFIED_VENUE_LABELS: Record<string, string> = {
  fox: "FOX (fox)",
  out: "Outcome (out)",
  skew: "Skew (skew)",
  txyz: "trade[XYZ] (txyz)",
};

export function formatVenueLabel(venue: string) {
  return VERIFIED_VENUE_LABELS[venue] ?? venue;
}

function matchesSearchTerm(market: Market, query: string) {
  return (market.searchTerms ?? []).some((term) => {
    const normalizedTerm = term.toLowerCase();
    return normalizedTerm === query || normalizedTerm.split(/[^a-z0-9]+/).includes(query);
  });
}

export function filterMarkets(markets: Market[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return markets;
  const metadataMatches = markets.filter((market) => matchesSearchTerm(market, normalizedQuery));
  if (metadataMatches.length) return metadataMatches;
  return markets.filter((market) => market.name.toLowerCase().includes(normalizedQuery));
}

export function filterAndSortMarkets(markets: Market[], options: MarketDiscoveryOptions) {
  const scoped = markets.filter((market) => {
    const categoryMatches = options.category === "all" || market.category === options.category;
    const venueMatches = options.venue === "all" || (
      options.venue === PROTOCOL_NATIVE_VENUE_FILTER
        ? market.protocolNative === true
        : options.venue === MISSING_VENUE_FILTER
          ? !market.venue && market.protocolNative !== true
          : market.venue === options.venue
    );
    return categoryMatches && venueMatches;
  });
  const filtered = filterMarkets(scoped, options.query);
  if (options.sort === "default") return filtered;

  const direction = options.sort === "yes-high" ? -1 : 1;
  return filtered
    .map((market, index) => ({ market, index }))
    .sort((a, b) => {
      const aPrice = a.market.yesPrice;
      const bPrice = b.market.yesPrice;
      if (aPrice == null && bPrice == null) return a.index - b.index;
      if (aPrice == null) return 1;
      if (bPrice == null) return -1;
      return (aPrice - bPrice) * direction || a.index - b.index;
    })
    .map(({ market }) => market);
}

export function displayedSource(source: MarketSource, fetchedAt: string): MarketSource {
  if (source !== "live") return source;
  const timestamp = Date.parse(fetchedAt);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= MARKET_FRESHNESS_WINDOW_MS
    ? "live"
    : "stale";
}

export function MarketList({
  initialMarkets,
  initialSource,
}: {
  initialMarkets: Market[];
  initialSource: MarketSource;
}) {
  const [markets, setMarkets] = useState(initialMarkets);
  const [source, setSource] = useState<MarketSource>(initialSource);
  const [query, setQuery] = useState(DEFAULT_MARKET_DISCOVERY_OPTIONS.query);
  const [category, setCategory] = useState<"all" | MarketCategory>(DEFAULT_MARKET_DISCOVERY_OPTIONS.category);
  const [venue, setVenue] = useState(DEFAULT_MARKET_DISCOVERY_OPTIONS.venue);
  const [sort, setSort] = useState<MarketSort>(DEFAULT_MARKET_DISCOVERY_OPTIONS.sort);
  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch("/api/markets");
        const data = await response.json();
        setMarkets(data.markets);
        setSource(displayedSource(data.source, data.fetchedAt));
      } catch { /* retain last known snapshot */ }
    };
    const id = window.setInterval(refresh, 8_000);
    return () => window.clearInterval(id);
  }, []);
  const categories = useMemo(() => {
    const available = new Set(markets.map((market) => market.category).filter(Boolean));
    return CATEGORY_ORDER.filter((option) => available.has(option));
  }, [markets]);
  const venues = useMemo(() => [...new Set(
    markets.map((market) => market.venue).filter((value): value is string => Boolean(value)),
  )].sort(), [markets]);
  const hasProtocolNativeMarkets = useMemo(() => markets.some((market) => market.protocolNative === true), [markets]);
  const hasUnknownVenueMarkets = useMemo(() => markets.some(
    (market) => !market.venue && market.protocolNative !== true,
  ), [markets]);
  const visible = useMemo(() => filterAndSortMarkets(markets, {
    query,
    category,
    venue,
    sort,
  }), [markets, query, category, venue, sort]);
  const filtersActive = Boolean(query.trim()) || category !== "all" || venue !== "all" || sort !== "default";
  const resetFilters = () => {
    setQuery(DEFAULT_MARKET_DISCOVERY_OPTIONS.query);
    setCategory(DEFAULT_MARKET_DISCOVERY_OPTIONS.category);
    setVenue(DEFAULT_MARKET_DISCOVERY_OPTIONS.venue);
    setSort(DEFAULT_MARKET_DISCOVERY_OPTIONS.sort);
  };

  return <>
    <section className="market-discovery" aria-label="Market discovery filters">
      <div className="searchbar"><Search size={16} aria-hidden="true" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search markets…" aria-label="Search markets" /></div>
      <div className="market-filter-row">
        <div className="market-category-filters" role="group" aria-label="Filter by category">
          <button type="button" className="market-filter-chip" aria-pressed={category === "all"} onClick={() => setCategory("all")}>All</button>
          {categories.map((option) => <button key={option} type="button" className="market-filter-chip" aria-pressed={category === option} onClick={() => setCategory(option)}>{option}</button>)}
        </div>
        <div className="market-select-filters">
          <label className="market-filter-select" htmlFor="market-venue"><span>Venue</span><select id="market-venue" value={venue} onChange={(event) => setVenue(event.target.value)}><option value="all">All venues</option>{venues.map((option) => <option value={option} key={option}>{formatVenueLabel(option)}</option>)}{hasProtocolNativeMarkets && <option value={PROTOCOL_NATIVE_VENUE_FILTER}>Protocol-native</option>}{hasUnknownVenueMarkets && <option value={MISSING_VENUE_FILTER}>Unknown venue</option>}</select></label>
          <label className="market-filter-select" htmlFor="market-sort"><span>Sort</span><select id="market-sort" value={sort} onChange={(event) => setSort(event.target.value as MarketSort)}><option value="default">Market order</option><option value="yes-high">YES: high to low</option><option value="yes-low">YES: low to high</option></select></label>
        </div>
      </div>
      <div className="market-filter-summary"><span role="status" aria-live="polite">{visible.length} matching {visible.length === 1 ? "market" : "markets"}</span>{filtersActive && <button type="button" className="market-filter-reset" onClick={resetFilters}>Reset filters</button>}</div>
    </section>
    {source === "preview" && <div className="notice">Preview data is shown while live Hyperliquid outcome metadata is unavailable.</div>}
    {source === "stale" && <div className="notice">Last known prices are shown while live Hyperliquid data refreshes.</div>}
    <div className="market-list">
      {visible.map((market) => <article className="market-card" key={market.id}>
        <div className="market-card-copy"><div className="market-meta"><span>{market.category ?? "HIP-4"}</span><span>Market #{market.id}</span></div><Link href={`/markets/${market.id}`} className="market-title">{market.name}</Link></div>
        <div className="market-card-probabilities" aria-label={`Current probabilities for ${market.name}`}>
          <div className="prob prob-yes"><span className="prob-label">YES</span><span className="prob-value live-pulse">{formatProbability(market.yesPrice)}</span></div>
          <div className="prob prob-no"><span className="prob-label">NO</span><span className="prob-value">{formatProbability(market.noPrice)}</span></div>
        </div>
        <Link href={`/markets/${market.id}`} className="btn btn-quiet market-card-action" aria-label={`Set alert for ${market.name}`}>Set alert <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </article>)}
      {!visible.length && <div className="empty"><p>No markets match the selected filters.</p><button className="btn btn-quiet" type="button" onClick={resetFilters}>Reset filters</button></div>}
    </div>
  </>;
}
