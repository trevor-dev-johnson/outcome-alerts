import { describe, expect, it } from "vitest";
import { shouldRedirectAuthenticatedUser } from "./proxy";

describe("authenticated login routing", () => {
  it("does not hide an authentication callback failure behind the previous session", () => {
    expect(shouldRedirectAuthenticatedUser("/login", "auth")).toBe(false);
  });

  it("continues redirecting authenticated users away from ordinary public entry pages", () => {
    expect(shouldRedirectAuthenticatedUser("/login", null)).toBe(true);
    expect(shouldRedirectAuthenticatedUser("/", null)).toBe(true);
  });
});
