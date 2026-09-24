import { NextResponse } from "next/server";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const result = await getMarketsWithFallback();
  const durationMs = Math.round(performance.now() - startedAt);
  return NextResponse.json(result, {
    headers: {
      "cache-control": "public, s-maxage=5, stale-while-revalidate=15",
      "server-timing": `markets;dur=${durationMs}`,
    },
  });
}
