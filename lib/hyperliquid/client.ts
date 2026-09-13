import type { Market } from "@/lib/types";

const API_URL = process.env.HYPERLIQUID_API_URL ?? "https://api.hyperliquid.xyz";

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

async function info<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_URL}/info`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Hyperliquid returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchMarkets(): Promise<Market[]> {
  const [metadata, mids] = await Promise.all([
    info<{ outcomes?: OutcomeMetaItem[]; questions?: OutcomeQuestion[] }>({ type: "outcomeMeta" }),
    info<Record<string, string>>({ type: "allMids" }),
  ]);
  const questionByOutcome = new Map<number, OutcomeQuestion>();
  for (const question of metadata.questions ?? []) for (const id of question.namedOutcomes ?? []) questionByOutcome.set(id, question);
  return (metadata.outcomes ?? [])
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
}

export const previewMarkets: Market[] = [
  { id: "1042", name: "Will BTC trade above $150,000 by December 31?", category: "Crypto", yesCoin: "#10420", noCoin: "#10421", yesPrice: 0.714, noPrice: 0.286, closesAt: "2026-12-31T23:59:59Z" },
  { id: "1048", name: "Will ETH outperform BTC this quarter?", category: "Crypto", yesCoin: "#10480", noCoin: "#10481", yesPrice: 0.438, noPrice: 0.562, closesAt: "2026-09-30T23:59:59Z" },
  { id: "1051", name: "Will the Fed cut rates at its next meeting?", category: "Macro", yesCoin: "#10510", noCoin: "#10511", yesPrice: 0.623, noPrice: 0.377, closesAt: "2026-11-04T18:00:00Z" },
  { id: "1059", name: "Will SOL close the month above $250?", category: "Crypto", yesCoin: "#10590", noCoin: "#10591", yesPrice: 0.291, noPrice: 0.709, closesAt: "2026-09-30T23:59:59Z" },
];

export async function getMarketsWithFallback() {
  try {
    const markets = await fetchMarkets();
    if (markets.length) return { markets, source: "live" as const };
    return { markets: previewMarkets, source: "preview" as const };
  } catch (error) {
    console.error("market_fetch_failed", { error: error instanceof Error ? error.message : String(error) });
    return { markets: previewMarkets, source: "preview" as const };
  }
}
