import { describe, expect, it, vi } from "vitest";
import { clearLocalSession } from "./session";

describe("clearLocalSession", () => {
  it("always requests a local sign-out", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    await expect(clearLocalSession({ auth: { signOut } })).resolves.toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("returns sign-out failures to the caller", async () => {
    const failure = new Error("sign-out failed");
    const signOut = vi.fn(async () => ({ error: failure }));
    await expect(clearLocalSession({ auth: { signOut } })).resolves.toBe(failure);
  });
});
