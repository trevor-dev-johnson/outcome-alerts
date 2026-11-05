import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), redirect: vi.fn(), markets: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthContext: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/hyperliquid/client", () => ({ getMarketsWithFallback: mocks.markets }));
vi.mock("./actions", () => ({ createRadarSubscription: vi.fn(), manageRadarSubscription: vi.fn() }));
import RadarPage, { metadata } from "./page";
import { RadarCreateForm } from "./forms";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ viewer: { id: "preview", preview: true }, profile: null });
  mocks.markets.mockResolvedValue({ source: "preview", markets: [] });
  mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
});
describe("Radar page", () => {
  it("redirects anonymous users before loading private data", async () => {
    mocks.auth.mockResolvedValue({ viewer: null });
    await expect(RadarPage()).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/login?next=/radar");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("is private/noindex, labels sampled behavior, and never pretends preview can save", async () => {
    const html = renderToStaticMarkup(await RadarPage());
    expect(metadata.robots.index).toBe(false);
    expect(html).toContain("disabled"); expect(html).toContain("Local preview");
    expect(html).toContain("/settings"); expect(html).toContain("five minutes");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("requires consent and supplies keyboard-native controls", () => {
    const html = renderToStaticMarkup(createElement(RadarCreateForm, { markets: [{ id: "1", name: "Lakers vs Warriors" }], categories: ["NBA"], disabled: false }));
    expect(html).toContain('type="checkbox"'); expect(html).toContain('required=""');
    expect(html).toContain('name="window"'); expect(html).toContain('role="status"');
    expect(html).toContain("percentage points");
  });
});
