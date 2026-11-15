import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ viewer: vi.fn(), client: vi.fn(), markets: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/hyperliquid/client", () => ({
  getMarketsWithFallback: mocks.markets,
  isMarketSnapshotUsable: (snapshot: { source: string; fetchedAt: string }, now = Date.now()) => {
    const fetchedAt = Date.parse(snapshot.fetchedAt);
    const ageMs = now - fetchedAt;
    return snapshot.source !== "preview" && Number.isFinite(fetchedAt) && ageMs >= 0 && ageMs <= 60_000;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { createRadarSubscription, manageRadarSubscription } from "./actions";
function form(values: Record<string, string> = {}) {
  const result = new FormData();
  Object.entries({ targetKind: "category", target: "NBA", window: "1h", threshold: "5", consent: "yes", ...values }).forEach(([k, v]) => result.set(k, v));
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RADAR_PUBLIC_ENABLED", "true");
  mocks.viewer.mockResolvedValue({ id: "user-a", preview: false });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.markets.mockResolvedValue({
    source: "live",
    fetchedAt: new Date().toISOString(),
    markets: [{ id: "1", name: "Team names only", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6 }],
  });
});
describe("Radar actions", () => {
  it("fails closed before authentication or database access when the launch gate is disabled", async () => {
    vi.stubEnv("RADAR_PUBLIC_ENABLED", "false");
    expect(await createRadarSubscription({}, form())).toEqual({ error: "Radar is coming soon." });
    expect(await manageRadarSubscription({}, form())).toEqual({ error: "Radar is coming soon." });
    expect(mocks.viewer).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves opt-in with caller-derived identity only", async () => {
    expect(await createRadarSubscription({}, form({ user_id: "forged-user" }))).toHaveProperty("success");
    expect(mocks.rpc).toHaveBeenCalledWith("create_radar_subscription", { p_kind: "category", p_target: "NBA", p_window: "1h", p_threshold: 5, p_consent: true });
  });
  it("blocks anonymous and preview mutations before a database call", async () => {
    for (const viewer of [null, { id: "preview", preview: true }]) {
      mocks.viewer.mockResolvedValue(viewer);
      expect(await createRadarSubscription({}, form())).toHaveProperty("error");
      expect(await manageRadarSubscription({}, form())).toHaveProperty("error");
    }
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects missing consent, unsupported category, invalid threshold and expired metadata", async () => {
    for (const invalid of [{ consent: "" }, { target: "NFLX" }, { threshold: "NaN" }] as Record<string, string>[])
      expect(await createRadarSubscription({}, form(invalid))).toHaveProperty("error");
    mocks.markets.mockResolvedValue({
      source: "stale",
      fetchedAt: new Date(Date.now() - 60_001).toISOString(),
      markets: [{ id: "1", name: "Team names only", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6 }],
    });
    expect(await createRadarSubscription({}, form())).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("accepts usable cached metadata but rejects missing, closed, invalid-date, or unpriced markets", async () => {
    mocks.markets.mockResolvedValue({
      source: "stale",
      fetchedAt: new Date(Date.now() - 30_000).toISOString(),
      markets: [{ id: "1", name: "Team names only", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6 }],
    });
    expect(await createRadarSubscription({}, form())).toHaveProperty("success");

    for (const markets of [
      [],
      [{ id: "1", name: "Closed", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6, closesAt: new Date(Date.now() - 1).toISOString() }],
      [{ id: "1", name: "Invalid close", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6, closesAt: "invalid" }],
      [{ id: "1", name: "Empty close", searchTerms: ["NBA"], yesPrice: 0.4, noPrice: 0.6, closesAt: "" }],
      [{ id: "1", name: "No prices", searchTerms: ["NBA"], yesPrice: null, noPrice: null }],
    ]) {
      mocks.rpc.mockClear();
      mocks.markets.mockResolvedValue({ source: "live", fetchedAt: new Date().toISOString(), markets });
      expect(await createRadarSubscription({}, form())).toHaveProperty("error");
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  });
  it("does not infer a league from a title", async () => {
    mocks.markets.mockResolvedValue({
      source: "live",
      fetchedAt: new Date().toISOString(),
      markets: [{ id: "1", name: "NBA Finals", searchTerms: [], yesPrice: 0.4, noPrice: 0.6 }],
    });
    expect(await createRadarSubscription({}, form())).toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("manages by caller-scoped RPC and reports cross-user/missing records safely", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const operation of ["pause", "resume", "remove"]) {
      expect(await manageRadarSubscription({}, form({ id, operation }))).toHaveProperty("success");
      expect(mocks.rpc).toHaveBeenLastCalledWith("manage_radar_subscription", { p_id: id, p_operation: operation });
    }
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    expect(await manageRadarSubscription({}, form({ id, operation: "remove" }))).toHaveProperty("error");
  });
});
