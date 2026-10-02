import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicNav } from "./public-nav";

describe("PublicNav authentication state", () => {
  it("shows the standard anonymous navigation", () => {
    const html = renderToStaticMarkup(createElement(PublicNav));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual(["/", "/movers", "/about", "/login"]);
    expect(html).toContain(">Sign in</a>");
    expect(html).not.toContain('href="/alerts"');
    expect(html).not.toContain('href="/settings"');
  });

  it("shows the standard authenticated navigation without user details", () => {
    const html = renderToStaticMarkup(createElement(PublicNav, {
      authenticated: true,
      current: "markets",
    }));
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

    expect(hrefs).toEqual(["/", "/movers", "/markets", "/alerts", "/settings"]);
    expect(html).toContain('aria-current="page" href="/markets"');
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain('href="/about"');
  });
});
