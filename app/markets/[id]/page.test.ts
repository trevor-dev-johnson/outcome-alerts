import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthContext: vi.fn(),
  getMarketsWithFallback: vi.fn(),
  alertForm: vi.fn(({ telegramConnected }: { telegramConnected: boolean }) =>
    createElement("div", {
      "data-testid": "alert-form",
      "data-telegram-connected": String(telegramConnected),
    }),
  ),
  publicNav: vi.fn(({ authenticated, current }: { authenticated?: boolean; current?: string }) =>
    createElement("nav", {
      "data-authenticated": String(Boolean(authenticated)),
      "data-current": current,
    }, "Public navigation"),
  ),
}));

vi.mock("@/lib/auth", () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock("@/lib/hyperliquid/client", () => ({
  getMarketsWithFallback: mocks.getMarketsWithFallback,
}));
vi.mock("@/components/alert-form", () => ({ AlertForm: mocks.alertForm }));
vi.mock("@/components/public-nav", () => ({
  PublicNav: mocks.publicNav,
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));

import MarketDetailPage, { generateMetadata } from "./page";

const market = {
  id: "42",
  name: "Will this market resolve YES?",
  description: "Test market",
  yesCoin: "#420",
  noCoin: "#421",
  yesPrice: 0.6,
  noPrice: 0.4,
  closesAt: null,
};

describe("public market alert handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMarketsWithFallback.mockResolvedValue({ markets: [market] });
  });

  it("uses the market title and default social image in share metadata", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ id: market.id }) });

    expect(metadata.title).toEqual({ absolute: `${market.name} | OddsUp` });
    expect(metadata.description).toContain(market.name);
    expect(metadata.openGraph).toEqual(expect.objectContaining({
      title: `${market.name} | OddsUp`,
      url: "https://oddsup.xyz/markets/42",
      images: [expect.objectContaining({ url: "https://oddsup.xyz/opengraph-image" })],
    }));
    expect(metadata.twitter).toEqual(expect.objectContaining({
      card: "summary_large_image",
      title: `${market.name} | OddsUp`,
      images: [expect.objectContaining({ url: "https://oddsup.xyz/opengraph-image" })],
    }));
  });

  it("renders a safe login link instead of an alert form for an anonymous visitor", async () => {
    mocks.getAuthContext.mockResolvedValue({ viewer: null, profile: null });

    const page = await MarketDetailPage({ params: Promise.resolve({ id: market.id }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Sign in to create alert");
    expect(html).toContain('href="/login?next=%2Fmarkets%2F42"');
    expect(html).not.toContain('data-testid="alert-form"');
    expect(html).toContain('data-authenticated="false"');
    expect(html).toContain('data-current="markets"');
    expect(html).toContain("Trade YES on Hyperliquid");
    expect(html).toContain("Trade NO on Hyperliquid");
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23420"');
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23421"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('class="market-trade-actions"');
    expect(html).toContain("market-trade-yes");
    expect(html).toContain("market-trade-no");
    expect(html).not.toContain(">Trade on Hyperliquid<");
    expect(mocks.alertForm).not.toHaveBeenCalled();
  });

  it("suppresses only the side whose market identifier does not match", async () => {
    const unsupportedMarket = { ...market, id: "43", yesCoin: "#430", noCoin: "#999" };
    mocks.getMarketsWithFallback.mockResolvedValue({ markets: [unsupportedMarket] });
    mocks.getAuthContext.mockResolvedValue({ viewer: null, profile: null });

    const page = await MarketDetailPage({ params: Promise.resolve({ id: unsupportedMarket.id }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Trade YES on Hyperliquid");
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23430"');
    expect(html).not.toContain("Trade NO on Hyperliquid");
    expect(html).not.toContain("%23431");
    expect(html).toContain("Sign in to create alert");
  });

  it.each([
    [null, false],
    ["telegram-chat", true],
  ])("preserves the authenticated form when Telegram chat is %s", async (telegramChatId, connected) => {
    mocks.getAuthContext.mockResolvedValue({
      viewer: { id: "user-1", email: "owner@example.com", preview: false },
      profile: { telegram_chat_id: telegramChatId },
    });

    const page = await MarketDetailPage({ params: Promise.resolve({ id: market.id }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-testid="alert-form"');
    expect(html).toContain(`data-telegram-connected="${String(connected)}"`);
    expect(html).not.toContain('href="/login?next=%2Fmarkets%2F42"');
    expect(html).toContain('data-authenticated="true"');
    expect(html).toContain('data-current="markets"');
    expect(html).toContain("Trade YES on Hyperliquid");
    expect(html).toContain("Trade NO on Hyperliquid");
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23420"');
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23421"');
  });
});
