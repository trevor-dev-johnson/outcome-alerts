import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMarketsWithFallback: vi.fn(),
  getViewer: vi.fn(),
  marketList: vi.fn(({ initialMarkets, initialSource }) => createElement(
    "div",
    { "data-market-count": initialMarkets.length, "data-source": initialSource },
  )),
  publicNav: vi.fn(({ authenticated, current }) => createElement(
    "nav",
    { "data-authenticated": String(Boolean(authenticated)), "data-current": current },
  )),
}));

vi.mock("@/lib/hyperliquid/client", () => ({
  getMarketsWithFallback: mocks.getMarketsWithFallback,
}));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/components/market-list", () => ({ MarketList: mocks.marketList }));
vi.mock("@/components/public-nav", () => ({ PublicNav: mocks.publicNav }));

import MarketsPage, { metadata } from "./page";

const markets = [{
  id: "42",
  name: "Will Boston beat New York?",
  searchTerms: ["NBA", "basketball"],
  yesCoin: "#420",
  noCoin: "#421",
  yesPrice: 0.6,
  noPrice: 0.4,
}];

describe("public Markets page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketsWithFallback.mockResolvedValue({ markets, source: "live", fetchedAt: new Date().toISOString() });
  });

  it("renders public market data for an anonymous visitor", async () => {
    mocks.getViewer.mockResolvedValue(null);

    const html = renderToStaticMarkup(await MarketsPage());

    expect(html).toContain('data-authenticated="false"');
    expect(html).toContain('data-current="markets"');
    expect(html).toContain('data-market-count="1"');
    expect(html).toContain('data-source="live"');
    expect(mocks.marketList).toHaveBeenCalledWith({ initialMarkets: markets, initialSource: "live" }, undefined);
  });

  it("keeps authenticated navigation without adding user data to the market list", async () => {
    mocks.getViewer.mockResolvedValue({ id: "user-1", email: "owner@example.com", preview: false });

    const html = renderToStaticMarkup(await MarketsPage());

    expect(html).toContain('data-authenticated="true"');
    expect(html).not.toContain("owner@example.com");
    expect(mocks.marketList).toHaveBeenCalledWith({ initialMarkets: markets, initialSource: "live" }, undefined);
  });

  it("preserves the existing noindex policy", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false, nocache: true });
  });
});
