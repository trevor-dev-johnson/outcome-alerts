import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERT_SYNC_INTERVAL_MS,
  DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
  getAlertSyncInterval,
  getRadarDeliveryConfig,
  getWorkerShutdownTimeout,
} from "./config";

describe("alert synchronization interval", () => {
  it("defaults subscription and claim-state synchronization to 30 seconds", () => {
    expect(DEFAULT_ALERT_SYNC_INTERVAL_MS).toBe(30_000);
    expect(getAlertSyncInterval(undefined)).toBe(30_000);
  });

  it("continues to honor an explicit deployment override", () => {
    expect(getAlertSyncInterval("45000")).toBe(45_000);
  });
});

describe("worker shutdown timeout", () => {
  it("defaults the bounded application drain to 20 seconds", () => {
    expect(DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS).toBe(20_000);
    expect(getWorkerShutdownTimeout(undefined)).toBe(20_000);
    expect(getWorkerShutdownTimeout(" ")).toBe(20_000);
  });

  it("honors a bounded deployment override", () => {
    expect(getWorkerShutdownTimeout("30000")).toBe(30_000);
    expect(getWorkerShutdownTimeout("120000")).toBe(120_000);
  });

  it("falls back safely for invalid or unbounded values", () => {
    expect(getWorkerShutdownTimeout("999")).toBe(20_000);
    expect(getWorkerShutdownTimeout("120001")).toBe(20_000);
    expect(getWorkerShutdownTimeout("not-a-number")).toBe(20_000);
  });
});

describe("Radar delivery configuration", () => {
  const first = "11111111-1111-4111-8111-111111111111";
  const second = "22222222-2222-4222-8222-222222222222";

  it("keeps the master switch fail-closed", () => {
    expect(getRadarDeliveryConfig(undefined, "true", first)).toEqual({ enabled: false, mode: "disabled" });
    expect(getRadarDeliveryConfig("false", "true", first)).toEqual({ enabled: false, mode: "disabled" });
  });

  it("requires a valid non-empty allowlist in canary mode", () => {
    expect(getRadarDeliveryConfig("true", "true", undefined)).toEqual({ enabled: false, mode: "disabled" });
    expect(getRadarDeliveryConfig("true", "true", " ")).toEqual({ enabled: false, mode: "disabled" });
    expect(getRadarDeliveryConfig("true", "true", `${first},not-a-uuid`)).toEqual({ enabled: false, mode: "disabled" });
  });

  it("normalizes and deduplicates authorized canary accounts", () => {
    const result = getRadarDeliveryConfig("true", "true", `${first.toUpperCase()}, ${second},${first}`);
    expect(result.enabled && result.mode === "canary" ? [...result.userIds] : []).toEqual([first, second]);
  });

  it("fails closed for malformed modes or an orphaned allowlist", () => {
    expect(getRadarDeliveryConfig("true", "TRUE", first)).toEqual({ enabled: false, mode: "disabled" });
    expect(getRadarDeliveryConfig("true", undefined, first)).toEqual({ enabled: false, mode: "disabled" });
  });

  it("preserves separately approved global delivery semantics", () => {
    expect(getRadarDeliveryConfig("true", undefined, undefined)).toEqual({ enabled: true, mode: "global" });
    expect(getRadarDeliveryConfig("true", "false", "")).toEqual({ enabled: true, mode: "global" });
  });
});
