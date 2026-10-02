import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_SYNC_INTERVAL_MS, getAlertSyncInterval } from "./config";

describe("alert synchronization interval", () => {
  it("defaults subscription and claim-state synchronization to 30 seconds", () => {
    expect(DEFAULT_ALERT_SYNC_INTERVAL_MS).toBe(30_000);
    expect(getAlertSyncInterval(undefined)).toBe(30_000);
  });

  it("continues to honor an explicit deployment override", () => {
    expect(getAlertSyncInterval("45000")).toBe(45_000);
  });
});
