import { describe, expect, it } from "vitest";
import { getHyperliquidMarketUrl } from "./market-url";

describe("getHyperliquidMarketUrl", () => {
  it("maps a HIP-4 outcome to Hyperliquid's official trade route", () => {
    expect(getHyperliquidMarketUrl({ id: "1473", yesCoin: "#14730" }))
      .toBe("https://app.hyperliquid.xyz/trade/%2314730");
  });

  it("derives the trusted YES coin when only the canonical outcome ID is available", () => {
    expect(getHyperliquidMarketUrl({ id: "42" }))
      .toBe("https://app.hyperliquid.xyz/trade/%23420");
  });

  it("links a NO alert to the corresponding NO outcome asset", () => {
    expect(getHyperliquidMarketUrl({ id: "1473" }, "NO"))
      .toBe("https://app.hyperliquid.xyz/trade/%2314731");
  });

  it.each([
    { id: "-1" },
    { id: "1.5" },
    { id: "01" },
    { id: "not-a-market" },
    { id: "9007199254740992" },
    { id: "42", yesCoin: "#421" },
    { id: "42", yesCoin: "#420", noCoin: "#999" },
    { id: "42", yesCoin: "https://evil.example" },
  ])("fails closed for malformed or mismatched market data: %o", (market) => {
    expect(getHyperliquidMarketUrl(market)).toBeNull();
  });
});
