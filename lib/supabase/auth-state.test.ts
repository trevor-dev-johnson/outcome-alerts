import { describe, expect, it, vi } from "vitest";
import {
  clearLocalAuthState,
  expireSupabaseAuthCookies,
  expireSupabasePkceVerifierCookies,
  hasSupabaseAuthCookies,
  isInvalidStoredAuthError,
  isSupabaseAuthCookie,
} from "./auth-state";

const supabaseUrl = "https://project-ref.supabase.co";

describe("Supabase browser auth state", () => {
  it("recognizes session chunks and every PKCE verifier cookie", () => {
    expect(isSupabaseAuthCookie("sb-project-ref-auth-token", supabaseUrl)).toBe(true);
    expect(isSupabaseAuthCookie("sb-project-ref-auth-token.0", supabaseUrl)).toBe(true);
    expect(isSupabaseAuthCookie("sb-project-ref-auth-token-code-verifier", supabaseUrl)).toBe(true);
    expect(isSupabaseAuthCookie("sb-project-ref-auth-token-flow-a1b2c3d4-code-verifier", supabaseUrl)).toBe(true);
    expect(isSupabaseAuthCookie("theme", supabaseUrl)).toBe(false);
  });

  it("expires only OddsUp Supabase auth cookies", () => {
    const setCookie = vi.fn();
    const cookies = [
      { name: "sb-project-ref-auth-token.0", value: "session" },
      { name: "sb-project-ref-auth-token-flow-a1b2c3d4-code-verifier", value: "verifier" },
      { name: "theme", value: "dark" },
    ];
    expect(hasSupabaseAuthCookies(cookies, supabaseUrl)).toBe(true);
    expect(expireSupabaseAuthCookies(cookies, setCookie, supabaseUrl)).toEqual([
      "sb-project-ref-auth-token.0",
      "sb-project-ref-auth-token-flow-a1b2c3d4-code-verifier",
    ]);
    expect(setCookie).toHaveBeenCalledTimes(2);
    expect(setCookie).not.toHaveBeenCalledWith("theme", expect.anything(), expect.anything());
  });

  it("expires only the failed PKCE flow and preserves a newer verifier", () => {
    const setCookie = vi.fn();
    const cookies = [
      { name: "sb-project-ref-auth-token", value: "new-session" },
      { name: "sb-project-ref-auth-token-flow-aaaaaaaa-code-verifier", value: "failed" },
      { name: "sb-project-ref-auth-token-flow-bbbbbbbb-code-verifier", value: "newer" },
      { name: "sb-project-ref-auth-token-code-verifier", value: "newer-legacy-alias" },
    ];

    expect(expireSupabasePkceVerifierCookies(
      cookies,
      setCookie,
      "aaaaaaaa",
      supabaseUrl,
    )).toEqual(["sb-project-ref-auth-token-flow-aaaaaaaa-code-verifier"]);
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setCookie).not.toHaveBeenCalledWith(
      "sb-project-ref-auth-token",
      expect.anything(),
      expect.anything(),
    );
    expect(setCookie).not.toHaveBeenCalledWith(
      "sb-project-ref-auth-token-flow-bbbbbbbb-code-verifier",
      expect.anything(),
      expect.anything(),
    );
  });

  it("purges stale cookies even when Supabase rejects local sign-out", async () => {
    const staleRefreshError = Object.assign(new Error("Invalid Refresh Token"), {
      code: "refresh_token_not_found",
    });
    const signOut = vi.fn(async () => ({ error: staleRefreshError }));
    const set = vi.fn();
    const cookieStore = {
      getAll: () => [
        { name: "sb-project-ref-auth-token", value: "stale" },
        { name: "unrelated", value: "keep" },
      ],
      set,
    };

    await expect(
      clearLocalAuthState({ auth: { signOut } }, cookieStore, supabaseUrl),
    ).resolves.toBe(staleRefreshError);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(set).toHaveBeenCalledWith("sb-project-ref-auth-token", "", { maxAge: 0, path: "/" });
    expect(set).not.toHaveBeenCalledWith("unrelated", expect.anything(), expect.anything());
  });

  it("classifies invalid sessions separately from transient Auth failures", () => {
    expect(isInvalidStoredAuthError({ code: "refresh_token_already_used" })).toBe(true);
    expect(isInvalidStoredAuthError({ name: "AuthSessionMissingError" })).toBe(true);
    expect(isInvalidStoredAuthError(new SyntaxError("bad cookie JSON"))).toBe(true);
    expect(isInvalidStoredAuthError({ name: "AuthRetryableFetchError", status: 503 })).toBe(false);
  });
});
