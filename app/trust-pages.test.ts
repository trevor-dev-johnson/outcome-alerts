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
    expect(html).toContain('href="/markets"');
    expect(html).toContain('href="/movers"');
    expect(html).toContain("no wallet connection");
  });

  it("publishes global Privacy and Terms links", () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it("describes implemented privacy behavior and publishes the approved contact", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    expect(privacyMetadata.alternates).toEqual({ canonical: "https://oddsup.xyz/privacy" });
    expect(html).toContain("Supabase Auth");
    expect(html).toContain("roughly 48 hours");
    expect(html).toContain("30-day cleanup window");
    expect(html).toContain("Resend");
    expect(html).toContain("There is no in-product account-deletion button");
    expect(html).toContain('href="https://x.com/whizzkee"');
    expect(html).not.toContain("Contact pending owner confirmation");
  });

  it("states concise watch-only terms and publishes the approved contact", () => {
    const html = renderToStaticMarkup(createElement(TermsPage));
    expect(termsMetadata.alternates).toEqual({ canonical: "https://oddsup.xyz/terms" });
    expect(html).toContain("watch-only monitoring tool");
    expect(html).toContain("Nothing on oddsUp is financial");
    expect(html).toContain("independent from Hyperliquid");
    expect(html).toContain("Radar is marked Coming Soon");
    expect(html).toContain("You remain responsible for every decision you make");
    expect(html).toContain('href="https://x.com/whizzkee"');
    expect(html).not.toContain("Legal terms still requiring owner review");
  });
});
