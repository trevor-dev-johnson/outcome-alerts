import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, BellRing } from "lucide-react";
import { MoversRefresh } from "@/components/movers-refresh";
import { PublicNav } from "@/components/public-nav";
import { getViewer } from "@/lib/auth";
import { formatProbability } from "@/lib/format";
import { getMoversSnapshot, type MoversSnapshot } from "@/lib/movers-data";
import { MOVER_WINDOWS, parseMoverWindow } from "@/lib/movers";
import { MOVERS_SOCIAL_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

const title = "HIP-4 Movers | OddsUp";
const description = "See which active Hyperliquid HIP-4 outcome probabilities are moving most over 5 minutes, 1 hour, and 24 hours.";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/movers" },
  openGraph: {
    title,
    description,
    url: `${SITE_URL}/movers`,
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
    images: [MOVERS_SOCIAL_IMAGE],
  },
  twitter: { card: "summary_large_image", title, description, images: [MOVERS_SOCIAL_IMAGE] },
};

function signedPoints(value: number) {
  if (value > 0) return `+${value.toFixed(1)}`;
  return value.toFixed(1);
}

function freshnessLabel(fetchedAt: string | null) {
  if (!fetchedAt) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(fetchedAt));
}

function freshnessState(state: MoversSnapshot["state"]) {
  if (state === "live") return "Live";
  if (state === "last-known") return "Last known";
  if (state === "updating") return "Updating";
  if (state === "collecting") return "Collecting history";
  return "Updating";
}

function windowLabel(window: (typeof MOVER_WINDOWS)[number]) {
  if (window === "5m") return "5-minute";
  if (window === "1h") return "1-hour";
  return "24-hour";
}

function alertConfigurationHref(marketId: string, authenticated: boolean) {
  const marketPath = `/markets/${encodeURIComponent(marketId)}#alert-configuration`;
  return authenticated ? marketPath : `/login?next=${encodeURIComponent(marketPath)}`;
}

const stateCopy = {
  collecting: "History is still being collected for this window. Movers will appear only when an exact comparison is available.",
  stale: "Current market data is updating. Movers are paused so old prices are not presented as current.",
  "upstream-error": "Live Hyperliquid market data is temporarily unavailable. No preview prices are used for Movers.",
  unavailable: "Shared market history is temporarily unavailable. Try again shortly.",
  empty: "No active markets currently qualify for Movers.",
} as const;

function showsMoverResults(
  state: MoversSnapshot["state"],
): state is "live" | "updating" | "last-known" {
  return state === "live" || state === "updating" || state === "last-known";
}

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
  const snapshotState = snapshot.state;

  return <>
    <PublicNav authenticated={Boolean(viewer)} current="movers" />
    <main className="app-main movers-main">
      <div className="shell">
        <header className="movers-head">
          <h1>Movers</h1>
          <div className="movers-freshness" data-state={snapshot.state}>
            <span className={`status-dot ${snapshot.state === "live" ? "" : "status-dot-muted"}`} />
            <span className="movers-freshness-state">{freshnessState(snapshot.state)}</span>
            {freshnessLabel(snapshot.fetchedAt) && (
              <time dateTime={snapshot.fetchedAt ?? undefined}>Observed {freshnessLabel(snapshot.fetchedAt)}</time>
            )}
          </div>
        </header>

        <section className="movers-controls" aria-label="Movers controls">
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
          <p className="movers-summary" aria-live="polite">
            <span>{snapshot.movers.length} ranked {snapshot.movers.length === 1 ? "market" : "markets"}</span>
            {snapshot.insufficientHistoryCount > 0 && (
              <span>{snapshot.insufficientHistoryCount} collecting {window} history</span>
            )}
          </p>
        </section>

        {!showsMoverResults(snapshotState) ? (
          <section className="movers-state" aria-live="polite">
            <p className="movers-state-window">{window} window</p>
            <h2>{snapshot.state === "collecting" ? "Building a reliable baseline" : "Movers unavailable"}</h2>
            <p>{stateCopy[snapshotState]}</p>
          </section>
        ) : (
          <>
            {snapshot.state === "updating" && (
              <p className="movers-note" role="status">
                Observations from {freshnessLabel(snapshot.fetchedAt)} are shown while the live snapshot refreshes. They are not current prices.
              </p>
            )}
            {snapshot.state === "last-known" && (
              <p className="movers-note" role="status">
                Last known results from {freshnessLabel(snapshot.fetchedAt)}. Live prices are temporarily unavailable, so these probabilities are not current.
              </p>
            )}
            <section className="movers-list" data-state={snapshot.state} aria-label={`${window} market movers`}>
              {snapshot.movers.map((mover, index) => {
                const DirectionIcon = mover.direction === "up" ? ArrowUp : mover.direction === "down" ? ArrowDown : ArrowRight;
                return (
                  <article className={`mover-card mover-card-${mover.direction}`} key={mover.marketId}>
                    <Link
                      className="mover-market-link"
                      href={`/markets/${mover.marketId}`}
                      aria-label={`View ${mover.marketName}`}
                    >
                      <span className="mover-context">
                        <strong>#{index + 1}</strong>
                        <span>{mover.category ?? "HIP-4"} · Market #{mover.marketId}</span>
                      </span>
                      <h2 className="mover-question">{mover.marketName}</h2>
                    </Link>
                    <div className="mover-data">
                      <div className={`mover-change mover-${mover.direction}`}>
                        <span className="mover-change-value mono">
                          <DirectionIcon size={19} strokeWidth={2.25} aria-hidden="true" />
                          <strong>{signedPoints(mover.deltaPoints)} pp</strong>
                        </span>
                        <span>{windowLabel(window)} change</span>
                      </div>
                      <div className="mover-probabilities mono" aria-label={`YES probability moved from ${formatProbability(mover.historicalProbability)} to ${formatProbability(mover.currentProbability)}`}>
                        <span className="mover-probability-values">
                          <span>{formatProbability(mover.historicalProbability)}</span>
                          <ArrowRight size={15} aria-hidden="true" />
                          <strong>{formatProbability(mover.currentProbability)}</strong>
                        </span>
                        <span className="mover-probability-label">YES probability</span>
                      </div>
                    </div>
                    {snapshot.state === "live" && (
                      <Link
                        className="btn btn-quiet mover-alert-action"
                        href={alertConfigurationHref(mover.marketId, Boolean(viewer))}
                        aria-label={`Set alert for ${mover.marketName}`}
                      >
                        <BellRing size={15} aria-hidden="true" />
                        Set alert
                      </Link>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
      <MoversRefresh />
    </main>
  </>;
}
