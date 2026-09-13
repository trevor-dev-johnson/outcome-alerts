import { NextResponse } from "next/server";
import { getMarketsWithFallback } from "@/lib/hyperliquid/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getMarketsWithFallback();
  return NextResponse.json(result, {
    headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=15" },
  });
}
