import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  publicNav: vi.fn(({ authenticated }: { authenticated?: boolean }) =>
    createElement("nav", { "data-authenticated": String(Boolean(authenticated)) }),
  ),
}));

vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/components/public-nav", () => ({ PublicNav: mocks.publicNav }));

import AboutPage from "./page";

describe("About navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows anonymous header and footer destinations", async () => {
    mocks.getViewer.mockResolvedValue(null);

    const html = renderToStaticMarkup(await AboutPage());

    expect(mocks.getViewer).toHaveBeenCalledTimes(1);
    expect(html).toContain('data-authenticated="false"');
    expect(html).toContain('href="/login">Sign in</a>');
  });

  it("shows authenticated header and footer destinations without exposing the viewer", async () => {
    mocks.getViewer.mockResolvedValue({ id: "user-1", email: "owner@example.com", preview: false });

    const html = renderToStaticMarkup(await AboutPage());

    expect(mocks.getViewer).toHaveBeenCalledTimes(1);
    expect(html).toContain('data-authenticated="true"');
    expect(html).toContain('href="/alerts">Alerts</a>');
    expect(html).not.toContain('href="/login">Sign in</a>');
    expect(html).not.toContain("owner@example.com");
  });
});
