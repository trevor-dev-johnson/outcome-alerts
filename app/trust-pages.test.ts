import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";
import Home from "./page";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import TermsPage, { metadata as termsMetadata } from "./terms/page";

describe("trust and policy pages", () => {
  it("states the homepage trust principles without implying a trading product", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("Free");
    expect(html).toContain("Watch-only");
    expect(html).toContain("Independent from Hyperliquid");
  });

  it("publishes global Privacy and Terms links", () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("describes implemented privacy behavior and flags owner decisions", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    expect(privacyMetadata.alternates).toEqual({ canonical: "https://oddsup.xyz/privacy" });
    expect(html).toContain("Supabase Auth");
    expect(html).toContain("roughly 48 hours");
    expect(html).toContain("30-day cleanup window");
    expect(html).toContain("Owner review required before publication");
    expect(html).toContain("no in-product account-deletion button");
  });

  it("states watch-only limitations and flags unresolved legal terms", () => {
    const html = renderToStaticMarkup(createElement(TermsPage));
    expect(termsMetadata.alternates).toEqual({ canonical: "https://oddsup.xyz/terms" });
    expect(html).toContain("watch-only monitoring tool");
    expect(html).toContain("Nothing on oddsUp is financial");
    expect(html).toContain("independent from Hyperliquid");
    expect(html).toContain("Radar is marked Coming Soon");
    expect(html).toContain("Legal terms still requiring owner review");
  });
});
