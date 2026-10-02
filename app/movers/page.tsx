import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { MoversRefresh } from "@/components/movers-refresh";
import { PublicNav } from "@/components/public-nav";
import { getViewer } from "@/lib/auth";
import { formatProbability } from "@/lib/format";
import { getMoversSnapshot } from "@/lib/movers-data";
import { MOVER_WINDOWS, parseMoverWindow } from "@/lib/movers";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const title = "HIP-4 Movers | OddsUp";
const description = "See which active Hyperliquid HIP-4 outcome probabilities are moving most over 5 minutes, 1 hour, and 24 hours.";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/movers" },
  openGraph: { title, description, url: `${SITE_URL}/movers`, siteName: SITE_NAME, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

function signedPoints(value: number) {
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

function freshnessLabel(fetchedAt: string | null) {
  if (!fetchedAt) return "Waiting for current data";
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(fetchedAt))}`;
}

const stateCopy = {
  collecting: "History is still being collected for this window. Movers will appear only when an exact comparison is available.",
  stale: "Current market data is updating. Movers are paused so old prices are not presented as current.",
  "upstream-error": "Live Hyperliquid market data is temporarily unavailable. No preview prices are used for Movers.",
  unavailable: "Shared market history is temporarily unavailable. Try again shortly.",
  empty: "No active markets currently qualify for Movers.",
} as const;

export default async function MoversPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const window = parseMoverWindow((await searchParams).window);
  const [snapshot, viewer] = await Promise.all([
    getMoversSnapshot(window),
    getViewer(),
  ]);

  return <>
    <PublicNav authenticated={Boolean(viewer)} current="movers" />
    <main className="app-main movers-main">
      <div className="shell">
        <header className="movers-head">
          <div>
            <p className="eyebrow">Hyperliquid HIP-4 · Shared market history</p>
            <h1>Movers</h1>
            <p className="movers-intro">The largest YES probability moves across active outcome markets.</p>
          </div>
          <div className="movers-freshness">
            <span className={`status-dot ${snapshot.state === "live" ? "" : "status-dot-muted"}`} />
            <span>{snapshot.state === "live" ? freshnessLabel(snapshot.fetchedAt) : "Updating"}</span>
          </div>
        </header>

        <nav className="mover-windows" aria-label="Movement window">
          {MOVER_WINDOWS.map((value) => (
            <Link
              key={value}
              href={`/movers?window=${value}`}
              aria-current={window === value ? "page" : undefined}
            >
              {value}
            </Link>
          ))}
        </nav>

        {snapshot.state !== "live" && snapshot.state !== "updating" ? (
          <section className="movers-state" aria-live="polite">
            <p className="eyebrow">{window} window</p>
            <h2>{snapshot.state === "collecting" ? "Building a reliable baseline" : "Movers unavailable"}</h2>
            <p>{stateCopy[snapshot.state]}</p>
          </section>
        ) : (
          <>
            {snapshot.state === "updating" && (
              <p className="movers-note">Recently observed prices are shown while the live snapshot refreshes.</p>
            )}
            {snapshot.insufficientHistoryCount > 0 && (
              <p className="movers-note">
                {snapshot.insufficientHistoryCount} active {snapshot.insufficientHistoryCount === 1 ? "market is" : "markets are"} still collecting {window} history.
              </p>
            )}
            <div className="movers-list">
              {snapshot.movers.map((mover, index) => {
                const DirectionIcon = mover.direction === "up" ? ArrowUp : mover.direction === "down" ? ArrowDown : ArrowRight;
                return (
                  <Link className="mover-row" href={`/markets/${mover.marketId}`} key={mover.marketId}>
                    <span className="mover-rank mono">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`mover-change mover-${mover.direction}`}>
                      <DirectionIcon size={20} aria-hidden="true" />
                      <strong>{signedPoints(mover.deltaPoints)}</strong>
                      <small>pts · {window}</small>
                    </span>
                    <span className="mover-market">
                      <strong>{mover.marketName}</strong>
                      <small>HIP-4 outcome · #{mover.marketId}</small>
                    </span>
                    <span className="mover-probabilities mono">
                      <span>{formatProbability(mover.historicalProbability)}</span>
                      <ArrowRight size={14} aria-hidden="true" />
                      <strong>{formatProbability(mover.currentProbability)}</strong>
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
      <MoversRefresh />
    </main>
  </>;
}
