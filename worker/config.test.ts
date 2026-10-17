import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALERT_SYNC_INTERVAL_MS,
  DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
  getAlertSyncInterval,
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
