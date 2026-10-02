import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicNav } from "./public-nav";

describe("PublicNav authentication state", () => {
  it("shows Sign in to anonymous visitors", () => {
    const html = renderToStaticMarkup(createElement(PublicNav));

    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in");
    expect(html).not.toContain('href="/markets"');
  });

  it("shows Markets instead of Sign in to authenticated visitors", () => {
    const html = renderToStaticMarkup(createElement(PublicNav, { authenticated: true }));

    expect(html).toContain('href="/markets"');
    expect(html).toContain("Markets");
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain("Sign in");
  });
});
