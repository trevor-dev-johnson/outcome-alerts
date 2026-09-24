import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { shouldRedirectAuthenticatedUser, updateSession } from "./proxy";

describe("authenticated login routing", () => {
  it("does not hide an authentication callback failure behind the previous session", () => {
    expect(shouldRedirectAuthenticatedUser("/login", "auth")).toBe(false);
    expect(shouldRedirectAuthenticatedUser("/login", "session-expired")).toBe(false);
  });

  it("continues redirecting authenticated users away from ordinary public entry pages", () => {
    expect(shouldRedirectAuthenticatedUser("/login", null)).toBe(true);
    expect(shouldRedirectAuthenticatedUser("/", null)).toBe(true);
  });
});

describe("invalid SSR auth recovery", () => {
  const getUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    mocks.createServerClient.mockReturnValue({ auth: { getUser } });
  });

  it("clears an invalid session cookie and redirects with a useful message", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", code: "refresh_token_not_found", status: 400 },
    });
    const request = new NextRequest("https://oddsup.xyz/alerts", {
      headers: { cookie: "sb-project-ref-auth-token=stale; theme=dark" },
    });

    const response = await updateSession(request);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-project-ref-auth-token=");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
    expect(setCookie).not.toContain("theme=");
  });

  it("recovers from a malformed session cookie", async () => {
    getUser.mockRejectedValue(new SyntaxError("Unexpected token"));
    const request = new NextRequest("https://oddsup.xyz/markets", {
      headers: { cookie: "sb-project-ref-auth-token=not-json" },
    });

    const response = await updateSession(request);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
  });

  it("does not redirect-loop if the recovery login page receives the stale cookie once more", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError", status: 400 },
    });
    const request = new NextRequest("https://oddsup.xyz/login?error=session-expired", {
      headers: { cookie: "sb-project-ref-auth-token.0=stale" },
    });

    const response = await updateSession(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toContain("sb-project-ref-auth-token.0=");
  });

  it("does not purge credentials for a transient Auth outage", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthRetryableFetchError", status: 503 },
    });
    const request = new NextRequest("https://oddsup.xyz/alerts", {
      headers: { cookie: "sb-project-ref-auth-token=session" },
    });

    const response = await updateSession(request);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?next=%2Falerts");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("leaves PKCE callback cookies untouched until the callback exchanges the code", async () => {
    const request = new NextRequest("https://oddsup.xyz/auth/callback?code=one-time", {
      headers: { cookie: "sb-project-ref-auth-token-code-verifier=verifier" },
    });

    const response = await updateSession(request);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
