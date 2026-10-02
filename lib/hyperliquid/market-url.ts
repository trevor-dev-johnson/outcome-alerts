import type { Market, Outcome } from "@/lib/types";

const HYPERLIQUID_APP_ORIGIN = "https://app.hyperliquid.xyz";

type HyperliquidMarketReference = Pick<Market, "id"> & Partial<Pick<Market, "yesCoin" | "noCoin">>;

export function getHyperliquidMarketUrl(market: HyperliquidMarketReference, outcome: Outcome = "YES"): string | null {
  const outcomeId = market.id;
  if (!/^(0|[1-9]\d*)$/.test(outcomeId)) return null;

  const numericOutcomeId = Number(outcomeId);
  if (!Number.isSafeInteger(numericOutcomeId)) return null;

  const encodedYesAsset = numericOutcomeId * 10;
  const encodedNoAsset = encodedYesAsset + 1;
  if (!Number.isSafeInteger(encodedYesAsset) || !Number.isSafeInteger(encodedNoAsset)) return null;

  const expectedYesCoin = `#${encodedYesAsset}`;
  const expectedNoCoin = `#${encodedNoAsset}`;
  const coin = outcome === "YES" ? expectedYesCoin : expectedNoCoin;
  const suppliedCoin = outcome === "YES" ? market.yesCoin : market.noCoin;
  if (suppliedCoin != null && suppliedCoin !== coin) return null;

  return new URL(`/trade/${encodeURIComponent(coin)}`, HYPERLIQUID_APP_ORIGIN).toString();
}
