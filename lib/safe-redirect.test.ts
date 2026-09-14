import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it("keeps application-relative paths", () => {
    expect(safeInternalPath("/alerts?status=active#latest")).toBe("/alerts?status=active#latest");
  });

  it.each([
    "https://example.com/phish",
    "//example.com/phish",
    "///example.com/phish",
    "/\\example.com/phish",
    "javascript:alert(1)",
  ])("rejects an external or protocol-relative target: %s", (target) => {
    expect(safeInternalPath(target)).toBe("/markets");
  });

  it("uses the supplied fallback for invalid input", () => {
    expect(safeInternalPath(null, "/")).toBe("/");
  });
});

