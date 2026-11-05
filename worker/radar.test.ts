import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RadarEngine, type RadarStore } from "./radar";
import type { RadarSubscription } from "@/lib/radar";
import type { Market } from "@/lib/types";

const now = Date.parse("2026-10-19T12:00:10Z");
const market: Market = { id: "1", name: "Lakers vs Warriors", searchTerms: ["NBA"], yesCoin: "#10", noCoin: "#11", yesPrice: .5, noPrice: .5 };
const sub: RadarSubscription = { id: "s", target_kind: "category", target: "NBA", window_name: "5m", threshold_points: 5, generation: 1, paused: false };
const current = { market_id: "1", bucket_at: "2026-10-19T12:00:00Z", observed_at: "2026-10-19T12:00:10Z", yes_probability: .5 };
const baseline = { ...current, bucket_at: "2026-10-19T11:55:00Z", observed_at: "2026-10-19T11:55:10Z", yes_probability: .4 };
function harness() {
  const events = new Map<string, { key: string; status: string }>();
  const store = {
    subscriptions: vi.fn(async () => [sub]),
    observations: vi.fn(async () => ({ current: [current], history: { "5m": [baseline] } })),
    claim: vi.fn<RadarStore["claim"]>(async (c, id) => {
      if (events.has(id)) return events.get(id)?.status === "reserved";
      const key = `${c.subscription.id}/${c.subscription.generation}/${c.market.id}/${c.current.bucket_at}`;
      if ([...events.values()].some((e) => e.key === key)) return false;
      events.set(id, { key, status: "reserved" }); return true;
    }),
    begin: vi.fn(async (id: string) => {
      const event = events.get(id);
      if (event?.status !== "reserved") return null;
      event.status = "sending"; return 123;
    }),
    finish: vi.fn(async (id: string, status: string) => { events.get(id)!.status = status; }),
    prune: vi.fn(async () => undefined),
  };
  const send = vi.fn(async () => undefined);
  const create = (enabled = true) => new RadarEngine(store, send, enabled, () => now, { sleep: async () => undefined });
  return { store, send, create, events };
}
beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => vi.restoreAllMocks());

describe("Radar delivery lifecycle", () => {
  it("disabled means no database work and no send", async () => {
    const h = harness(); await h.create(false).run([market]); expect(h.store.subscriptions).not.toHaveBeenCalled(); expect(h.send).not.toHaveBeenCalled();
  });
  it("single-flights concurrent cycles and suppresses repeats after restart", async () => {
    const h = harness(); const engine = h.create();
    await Promise.all([engine.run([market]), engine.run([market])]);
    await engine.run([market]); await h.create().run([market]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]).toEqual([123, expect.stringContaining("sampled 5m movement"), expect.any(AbortSignal)]);
  });
  it("recovers transient reservation failure using the same event ID", async () => {
    const h = harness(); const reserve = h.store.claim.getMockImplementation()!;
    h.store.claim.mockImplementationOnce(async (c, id) => { await reserve(c, id); throw new Error("timeout"); });
    await h.create().run([market]);
    expect(h.store.claim).toHaveBeenCalledTimes(2);
    expect(h.store.claim.mock.calls[0][1]).toBe(h.store.claim.mock.calls[1][1]);
    expect(h.send).toHaveBeenCalledTimes(1);
  });
  it("never resends Telegram success followed by completion timeout", async () => {
    const h = harness(); h.store.finish.mockRejectedValue(new Error("timeout"));
    await expect(h.create().run([market])).rejects.toThrow("timeout");
    await h.create().run([market]);
    expect(h.send).toHaveBeenCalledTimes(1); expect(h.store.finish).toHaveBeenCalledTimes(4);
  });
  it("records ambiguous Telegram failure without replay after restart", async () => {
    const h = harness(); h.send.mockRejectedValue(new Error("timeout"));
    await h.create().run([market]); await h.create().run([market]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.store.finish).toHaveBeenCalledWith(expect.any(String), "uncertain");
  });
  it("does not retry an ambiguous send gate or send on a rejected gate", async () => {
    const h = harness(); h.store.begin.mockRejectedValue(new Error("timeout"));
    await expect(h.create().run([market])).rejects.toThrow("timeout");
    expect(h.store.begin).toHaveBeenCalledTimes(1); expect(h.send).not.toHaveBeenCalled();
    h.store.begin.mockResolvedValue(null); await h.create().run([market]); expect(h.send).not.toHaveBeenCalled();
  });
  it("does not emit partial results when any history batch fails", async () => {
    const h = harness(); h.store.observations.mockRejectedValue(new Error("batch failed"));
    await expect(h.create().run([market])).rejects.toThrow(); expect(h.store.claim).not.toHaveBeenCalled();
  });
  it("rejects missing history, stale samples, closed markets, paused follows, and unknown metadata", async () => {
    const h = harness(); h.store.observations.mockResolvedValue({ current: [], history: { "5m": [] } });
    await h.create().run([market]); expect(h.send).not.toHaveBeenCalled();
    await h.create().run([{ ...market, closesAt: "2026-10-18" }]);
    await h.create().run([{ ...market, searchTerms: [] }]);
    h.store.subscriptions.mockResolvedValue([{ ...sub, paused: true }]); await h.create().run([market]);
    expect(h.store.claim).not.toHaveBeenCalled();
  });
  it("stops new deliveries during shutdown", async () => {
    const h = harness(); const engine = h.create();
    h.store.claim.mockImplementation(async () => { engine.stop(); return true; });
    await engine.run([market]); await engine.run([market]);
    expect(h.store.begin).not.toHaveBeenCalled(); expect(h.send).not.toHaveBeenCalled();
  });
  it("fails closed above safety limits", async () => {
    const h = harness(); await expect(h.create().run(Array(901).fill(market))).rejects.toThrow("radar_market_limit");
    h.store.subscriptions.mockResolvedValue(Array(1001).fill(sub));
    await expect(h.create().run([market])).rejects.toThrow("radar_subscription_limit");
    expect(h.send).not.toHaveBeenCalled();
  });
});
