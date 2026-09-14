import { describe, expect, it } from "vitest";
import { canonicalProductionUrl } from "./proxy";

describe("canonical production origin", () => {
  it("redirects alternate production hosts while preserving path and query", () => {
    expect(canonicalProductionUrl(
      "https://outcome-alerts.vercel.app/alerts?status=active",
      "https://oddsup.xyz",
      true,
    )?.toString()).toBe("https://oddsup.xyz/alerts?status=active");
  });

  it("does not redirect the canonical host or non-production environments", () => {
    expect(canonicalProductionUrl("https://oddsup.xyz/alerts", "https://oddsup.xyz", true)).toBeNull();
    expect(canonicalProductionUrl("http://localhost:3000/alerts", "https://oddsup.xyz", false)).toBeNull();
  });
});
