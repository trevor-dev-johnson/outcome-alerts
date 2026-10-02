import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MoversLoading from "./loading";

describe("Movers loading state", () => {
  it("does not guess the visitor's authentication state", () => {
    const html = renderToStaticMarkup(createElement(MoversLoading));

    expect(html).toContain('aria-label="Loading Movers"');
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("Public navigation");
  });
});
