import { afterEach, describe, expect, it, vi } from "vitest";
import { displayedSource } from "./market-list";

describe("market snapshot freshness display", () => {
  afterEach(() => vi.useRealTimers());

  it("marks an API or CDN snapshot stale after the five-second freshness window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:05.001Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("stale");
  });

  it("preserves live and preview states inside the freshness window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T12:00:04.999Z"));

    expect(displayedSource("live", "2026-09-24T12:00:00.000Z")).toBe("live");
    expect(displayedSource("preview", "not-a-date")).toBe("preview");
  });
});
