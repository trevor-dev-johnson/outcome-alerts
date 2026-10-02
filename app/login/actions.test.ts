import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  clearLocalAuthState: vi.fn(),
  cookies: vi.fn(),
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth-state", () => ({ clearLocalAuthState: mocks.clearLocalAuthState }));

import { sendMagicLink } from "./actions";

describe("sendMagicLink auth recovery", () => {
  const signInWithOtp = vi.fn();
  const client = { auth: { signInWithOtp } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client);
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.clearLocalAuthState.mockResolvedValue(null);
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("clears local auth state before starting the new PKCE flow", async () => {
    const formData = new FormData();
    formData.set("email", "second@example.com");
    await expect(sendMagicLink({}, formData)).resolves.toEqual({ message: "Magic link sent. Check your inbox." });
    expect(mocks.clearLocalAuthState).toHaveBeenCalledWith(client, mocks.cookieStore);
    expect(mocks.clearLocalAuthState.mock.invocationCallOrder[0]).toBeLessThan(signInWithOtp.mock.invocationCallOrder[0]);
  });

  it("starts a fresh login even when stale refresh state made sign-out fail", async () => {
    mocks.clearLocalAuthState.mockResolvedValue(
      Object.assign(new Error("Invalid Refresh Token"), { code: "refresh_token_not_found" }),
    );
    const formData = new FormData();
    formData.set("email", "returning@example.com");
    await expect(sendMagicLink({}, formData)).resolves.toEqual({ message: "Magic link sent. Check your inbox." });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("supports a successful fresh login immediately after automatic recovery", async () => {
    const formData = new FormData();
    formData.set("email", "returning@example.com");
    await sendMagicLink({}, formData);
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "returning@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fmarkets" },
    });
  });

  it.each([
    ["/markets/7637", "http://localhost:3000/auth/callback?next=%2Fmarkets%2F7637"],
    ["/movers?window=5m", "http://localhost:3000/auth/callback?next=%2Fmovers%3Fwindow%3D5m"],
  ])("preserves a safe internal destination through the magic-link callback: %s", async (next, expected) => {
    const formData = new FormData();
    formData.set("email", "returning@example.com");
    formData.set("next", next);

    await sendMagicLink({}, formData);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "returning@example.com",
      options: { emailRedirectTo: expected },
    });
  });

  it.each([
    ["missing", undefined],
    ["external", "https://example.com/phish"],
    ["protocol-relative", "//example.com/phish"],
  ])("falls back to Markets for a %s destination", async (_label, next) => {
    const formData = new FormData();
    formData.set("email", "returning@example.com");
    if (next) formData.set("next", next);

    await sendMagicLink({}, formData);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "returning@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fmarkets" },
    });
  });
});
