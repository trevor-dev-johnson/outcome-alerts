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

const mover = {
  marketId: "42",
  marketName: "Will the test market resolve YES?",
  closesAt: "2026-11-01T00:00:00.000Z",
  currentProbability: 0.62,
  historicalProbability: 0.51,
  deltaPoints: 11,
  direction: "up" as const,
  window: "5m" as const,
  currentObservedAt: "2026-10-02T12:00:00.000Z",
  historicalObservedAt: "2026-10-02T11:55:00.000Z",
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

  it("sends anonymous visitors to login with the selected market preserved", async () => {
    mocks.getViewer.mockResolvedValue(null);
    mocks.getMoversSnapshot.mockResolvedValue({
      ...snapshot,
      movers: [mover],
      insufficientHistoryCount: 0,
    });

    const page = await MoversPage({ searchParams: Promise.resolve({ window: "5m" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('href="/markets/42"');
    expect(html).toContain('href="/login?next=%2Fmarkets%2F42%23alert-configuration"');
    expect(html).toContain('aria-label="Set alert for Will the test market resolve YES?"');
  });

  it("takes authenticated users directly to the existing alert form", async () => {
    mocks.getViewer.mockResolvedValue({ id: "user-1", email: "owner@example.com", preview: false });
    mocks.getMoversSnapshot.mockResolvedValue({
      ...snapshot,
      movers: [mover],
      insufficientHistoryCount: 0,
    });

    const page = await MoversPage({ searchParams: Promise.resolve({ window: "5m" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('href="/markets/42#alert-configuration"');
    expect(html).not.toContain('/login?next=');
  });

  it("does not offer alert actions when the Movers snapshot is stale", async () => {
    mocks.getViewer.mockResolvedValue(null);
    mocks.getMoversSnapshot.mockResolvedValue({
      ...snapshot,
      state: "stale",
      movers: [mover],
    });

    const page = await MoversPage({ searchParams: Promise.resolve({ window: "5m" }) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Movers unavailable");
    expect(html).not.toContain("Set Alert");
    expect(html).not.toContain("alert-configuration");
  });
});
