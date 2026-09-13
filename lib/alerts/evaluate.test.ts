import { describe, expect, it } from "vitest";
import { didCrossThreshold } from "./evaluate";

describe("didCrossThreshold", () => {
  it("triggers when price crosses above", () => {
    expect(didCrossThreshold({ operator: "above", previousPrice: 0.69, currentPrice: 0.71, threshold: 0.7 })).toBe(true);
  });
  it("does not trigger when already above", () => {
    expect(didCrossThreshold({ operator: "above", previousPrice: 0.72, currentPrice: 0.73, threshold: 0.7 })).toBe(false);
  });
  it("triggers when price crosses below", () => {
    expect(didCrossThreshold({ operator: "below", previousPrice: 0.31, currentPrice: 0.29, threshold: 0.3 })).toBe(true);
  });
  it("does not trigger when already below", () => {
    expect(didCrossThreshold({ operator: "below", previousPrice: 0.28, currentPrice: 0.27, threshold: 0.3 })).toBe(false);
  });
  it("does not trigger without a crossing", () => {
    expect(didCrossThreshold({ operator: "above", previousPrice: 0.65, currentPrice: 0.67, threshold: 0.7 })).toBe(false);
  });
  it("uses the first observation only as a baseline", () => {
    expect(didCrossThreshold({ operator: "above", previousPrice: null, currentPrice: 0.8, threshold: 0.7 })).toBe(false);
  });
});
