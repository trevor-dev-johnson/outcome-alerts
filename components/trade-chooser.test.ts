import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TradeChooser } from "./trade-chooser";

describe("TradeChooser", () => {
  it("renders one neutral trigger with explicit YES and NO choices", () => {
    const html = renderToStaticMarkup(createElement(TradeChooser, {
      yesUrl: "https://app.hyperliquid.xyz/trade/%23420",
      noUrl: "https://app.hyperliquid.xyz/trade/%23421",
      yesProbability: 0.41,
      noProbability: 0.59,
    }));

    expect(html.match(/Trade on Hyperliquid/g)).toHaveLength(1);
    expect(html).toContain("<summary");
    expect(html).not.toContain("<details open");
    expect(html).toContain("YES <span aria-hidden=\"true\">·</span> 41.0%");
    expect(html).toContain("NO <span aria-hidden=\"true\">·</span> 59.0%");
    expect(html).toContain('data-trade-outcome="YES"');
    expect(html).toContain('data-trade-outcome="NO"');
    expect(html).toContain('aria-label="Trade YES on Hyperliquid at 41.0%"');
    expect(html).toContain('aria-label="Trade NO on Hyperliquid at 59.0%"');
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23420"');
    expect(html).toContain('href="https://app.hyperliquid.xyz/trade/%23421"');
    expect(html).toContain('aria-label="Choose an outcome to trade"');
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });

  it("omits an invalid side without removing the valid choice", () => {
    const html = renderToStaticMarkup(createElement(TradeChooser, {
      yesUrl: "https://app.hyperliquid.xyz/trade/%23420",
      noUrl: null,
      yesProbability: 0.41,
      noProbability: 0.59,
    }));

    expect(html).toContain("Trade on Hyperliquid");
    expect(html).toContain('data-trade-outcome="YES"');
    expect(html).not.toContain('data-trade-outcome="NO"');
  });

  it("renders no trade control when neither side is valid", () => {
    const html = renderToStaticMarkup(createElement(TradeChooser, {
      yesUrl: null,
      noUrl: null,
      yesProbability: 0.41,
      noProbability: 0.59,
    }));

    expect(html).toBe("");
  });
});
