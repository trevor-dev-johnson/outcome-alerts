import { unstable_cache } from "next/cache";
import type { Market, MarketSnapshot } from "@/lib/types";

const API_URL = process.env.HYPERLIQUID_API_URL ?? "https://api.hyperliquid.xyz";
export const MARKET_CACHE_SECONDS = 5;
const MARKET_CACHE_MAX_AGE_MS = MARKET_CACHE_SECONDS * 1_000;
const MARKET_REVALIDATION_COOLDOWN_MS = 10_000;

interface OutcomeMetaItem {
  outcome: number | string;
  name?: string;
  description?: string;
  status?: string;
  sideSpecs?: Array<{ name?: string }>;
  startTime?: number;
  endTime?: number;
}

interface OutcomeQuestion {
  name?: string;
  description?: string;
  fallbackOutcome?: number;
  namedOutcomes?: number[];
}

function parseDescriptor(value = "") {
  return Object.fromEntries(value.split("|").map((part) => {
    const index = part.indexOf(":");
    return index < 0 ? [part, ""] : [part.slice(0, index), part.slice(index + 1).trim()];
  }));
}

function formatTarget(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toLocaleString("en-US")}` : value;
}

function formatCodeDate(value?: string) {
  if (!value || !/^\d{8}-\d{4}$/.test(value)) return "the deadline";
  const year = Number(value.slice(0,4)), month = Number(value.slice(4,6))-1, day = Number(value.slice(6,8));
  return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", timeZone:"UTC" }).format(new Date(Date.UTC(year,month,day)));
}

function readableName(item: OutcomeMetaItem, question?: OutcomeQuestion) {
  const own = parseDescriptor(item.description); const parent = parseDescriptor(question?.description);
  switch (item.name) {
    case "template:priceTouch": return `Will ${own.perp} touch ${formatTarget(own.target)} by ${formatCodeDate(own.time)}?`;
    case "template:binaryPrice": return `Will ${own.perp} be above ${formatTarget(own.threshold)} on ${formatCodeDate(own.time)}?`;
    case "template:companyIpoConfirmed": return `Will ${own.company} confirm an IPO by ${formatCodeDate(own.dateTime)}?`;
    case "template:policyRateDecrease": return `Will ${parent.institution ?? "the central bank"} decrease rates at its ${parent.decisionLabel ?? "next"} decision?`;
    case "template:policyRateIncrease": return `Will ${parent.institution ?? "the central bank"} increase rates at its ${parent.decisionLabel ?? "next"} decision?`;
    case "template:policyRateNoChange": return `Will ${parent.institution ?? "the central bank"} leave rates unchanged at its ${parent.decisionLabel ?? "next"} decision?`;
    case "template:sportsTournamentParticipant": return `Will ${own.participant} win the ${parent.competition ?? "tournament"}?`;
    case "template:sportsContestWinner": return `Will ${own.participantA} beat ${own.participantB}?`;
    case "template:sportsContestParticipant2": return `Will ${own.participant} win ${parent.event ?? "the match"}?`;
    case "template:sportsContestDraw2": return `Will ${parent.event ?? "the match"} end in a draw?`;
    case "template:sportsOverUnderMarket": return `Will ${own.measure} be over ${own.line}?`;
    case "Recurring": if (own.class === "priceBinary") return `Will ${own.underlying} be above ${formatTarget(own.targetPrice)} on ${formatCodeDate(own.expiry)}?`; break;
  }
  return item.name && !item.name.startsWith("template:") ? item.name : item.description || `Outcome market ${item.outcome}`;
}

function sideCoin(outcomeId: string, sideIndex: number) {
  return `#${Number(outcomeId) * 10 + sideIndex}`;
}

async function info<T>(requestType: string, body: Record<string, unknown>): Promise<T> {
  const startedAt = performance.now();
  let status = 0;
  try {
    const response = await fetch(`${API_URL}/info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    status = response.status;
    if (!response.ok) throw new Error(`Hyperliquid returned ${response.status}`);
    return response.json() as Promise<T>;
  } finally {
    console.info("hyperliquid_request_timing", {
      requestType,
      durationMs: Math.round(performance.now() - startedAt),
      status,
    });
  }
}

export async function fetchMarkets(): Promise<Market[]> {
  const startedAt = performance.now();
  const [metadata, mids] = await Promise.all([
    info<{ outcomes?: OutcomeMetaItem[]; questions?: OutcomeQuestion[] }>("outcomeMeta", { type: "outcomeMeta" }),
    info<Record<string, string>>("allMids", { type: "allMids" }),
  ]);
  const questionByOutcome = new Map<number, OutcomeQuestion>();
  for (const question of metadata.questions ?? []) for (const id of question.namedOutcomes ?? []) questionByOutcome.set(id, question);
  const markets = (metadata.outcomes ?? [])
    .filter((item) => item.status?.toLowerCase() !== "resolved" && !item.name?.toLowerCase().includes("fallback") && item.name !== "Recurring Named Outcome")
    .map((item) => {
      const id = String(item.outcome);
      const yesIndex = Math.max(0, item.sideSpecs?.findIndex((side) => side.name?.toUpperCase() === "YES") ?? 0);
      const noIndex = Math.max(1, item.sideSpecs?.findIndex((side) => side.name?.toUpperCase() === "NO") ?? 1);
      const yesCoin = sideCoin(id, yesIndex);
      const noCoin = sideCoin(id, noIndex);
      const yes = mids[yesCoin] ? Number(mids[yesCoin]) : null;
      const no = mids[noCoin] ? Number(mids[noCoin]) : yes == null ? null : 1 - yes;
      return {
        id,
        name: readableName(item, questionByOutcome.get(Number(id))),
        description: item.description,
        yesCoin,
        noCoin,
        yesPrice: Number.isFinite(yes) ? yes : null,
        noPrice: Number.isFinite(no) ? no : null,
        closesAt: item.endTime ? new Date(item.endTime).toISOString() : null,
      };
    });
  console.info("hyperliquid_market_assembly_timing", {
    durationMs: Math.round(performance.now() - startedAt),
    marketCount: markets.length,
  });
  return markets;
}

export const previewMarkets: Market[] = [
  { id: "1042", name: "Will BTC trade above $150,000 by December 31?", category: "Crypto", yesCoin: "#10420", noCoin: "#10421", yesPrice: 0.714, noPrice: 0.286, closesAt: "2026-12-31T23:59:59Z" },
  { id: "1048", name: "Will ETH outperform BTC this quarter?", category: "Crypto", yesCoin: "#10480", noCoin: "#10481", yesPrice: 0.438, noPrice: 0.562, closesAt: "2026-09-30T23:59:59Z" },
  { id: "1051", name: "Will the Fed cut rates at its next meeting?", category: "Macro", yesCoin: "#10510", noCoin: "#10511", yesPrice: 0.623, noPrice: 0.377, closesAt: "2026-11-04T18:00:00Z" },
  { id: "1059", name: "Will SOL close the month above $250?", category: "Crypto", yesCoin: "#10590", noCoin: "#10591", yesPrice: 0.291, noPrice: 0.709, closesAt: "2026-09-30T23:59:59Z" },
];

type LiveMarketSnapshot = Omit<MarketSnapshot, "source"> & { source: "live" };

async function loadLiveMarketSnapshot(): Promise<LiveMarketSnapshot> {
  const markets = await fetchMarkets();
  if (!markets.length) throw new Error("Hyperliquid returned no active outcome markets");
  return { markets, source: "live", fetchedAt: new Date().toISOString() };
}

const loadCachedLiveMarketSnapshot = unstable_cache(
  loadLiveMarketSnapshot,
  ["public-hip4-market-snapshot-v1"],
  { revalidate: MARKET_CACHE_SECONDS, tags: ["public-hip4-markets"] },
);

let recentSnapshot: LiveMarketSnapshot | null = null;
let snapshotReadInFlight: Promise<LiveMarketSnapshot> | null = null;
let staleRevalidationCooldownUntil = 0;

function snapshotAgeMs(snapshot: LiveMarketSnapshot, now = Date.now()) {
  const fetchedAt = Date.parse(snapshot.fetchedAt);
  return Number.isFinite(fetchedAt) ? Math.max(0, now - fetchedAt) : Number.POSITIVE_INFINITY;
}

async function readSharedSnapshot() {
  if (recentSnapshot) {
    const now = Date.now();
    if (
      snapshotAgeMs(recentSnapshot, now) <= MARKET_CACHE_MAX_AGE_MS ||
      now < staleRevalidationCooldownUntil
    ) {
      return recentSnapshot;
    }
  }
  if (!snapshotReadInFlight) {
    snapshotReadInFlight = loadCachedLiveMarketSnapshot()
      .then((snapshot) => {
        recentSnapshot = snapshot;
        staleRevalidationCooldownUntil = snapshotAgeMs(snapshot) > MARKET_CACHE_MAX_AGE_MS
          ? Date.now() + MARKET_REVALIDATION_COOLDOWN_MS
          : 0;
        return snapshot;
      })
      .finally(() => { snapshotReadInFlight = null; });
  }
  return snapshotReadInFlight;
}

export async function getMarketsWithFallback(): Promise<MarketSnapshot> {
  const startedAt = performance.now();
  try {
    const snapshot = await readSharedSnapshot();
    const ageMs = snapshotAgeMs(snapshot);
    // Next can return the previous value while it performs one coalesced
    // background revalidation. Keep that behavior fast, but never call the
    // expired snapshot live.
    const source = ageMs > MARKET_CACHE_MAX_AGE_MS ? "stale" : "live";
    console.info("public_market_snapshot_timing", {
      durationMs: Math.round(performance.now() - startedAt),
      snapshotAgeMs: ageMs,
      source,
      marketCount: snapshot.markets.length,
    });
    return { ...snapshot, source };
  } catch (error) {
    console.error("market_fetch_failed", { error: error instanceof Error ? error.message : String(error) });
    console.info("public_market_snapshot_timing", {
      durationMs: Math.round(performance.now() - startedAt),
      snapshotAgeMs: 0,
      source: "preview",
      marketCount: previewMarkets.length,
    });
    return { markets: previewMarkets, source: "preview", fetchedAt: new Date().toISOString() };
  }
}
