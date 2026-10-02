import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMoversSnapshot: vi.fn(),
  getViewer: vi.fn(),
  publicNav: vi.fn(({ authenticated }: { authenticated?: boolean }) =>
    createElement("nav", { "data-authenticated": String(Boolean(authenticated)) }, "Public navigation"),
  ),
}));

vi.mock("@/lib/movers-data", () => ({ getMoversSnapshot: mocks.getMoversSnapshot }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/components/public-nav", () => ({ PublicNav: mocks.publicNav }));
vi.mock("@/components/movers-refresh", () => ({ MoversRefresh: () => null }));

import MoversPage from "./page";

const snapshot = {
  state: "live",
  movers: [],
  window: "5m",
  fetchedAt: "2026-10-02T12:00:00.000Z",
  eligibleMarketCount: 1,
  insufficientHistoryCount: 1,
};

describe("Movers public navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMoversSnapshot.mockResolvedValue(snapshot);
  });

  it("keeps Movers public and shows anonymous navigation", async () => {
    mocks.getViewer.mockResolvedValue(null);

    const page = await MoversPage({ searchParams: Promise.resolve({ window: "5m" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-authenticated="false"');
  });

  it("passes only an authentication boolean to the navigation", async () => {
    mocks.getViewer.mockResolvedValue({ id: "user-1", email: "owner@example.com", preview: false });

    const page = await MoversPage({ searchParams: Promise.resolve({ window: "5m" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('data-authenticated="true"');
    expect(html).not.toContain("owner@example.com");
    expect(mocks.publicNav).toHaveBeenCalledWith(
      expect.objectContaining({ authenticated: true, current: "movers" }),
      undefined,
    );
  });
});
