import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  clearLocalAuthState: vi.fn(),
  expireSupabasePkceVerifierCookies: vi.fn(),
  cookies: vi.fn(),
  cookieStore: { getAll: vi.fn(), set: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/auth-state", () => ({
  clearLocalAuthState: mocks.clearLocalAuthState,
  expireSupabasePkceVerifierCookies: mocks.expireSupabasePkceVerifierCookies,
  isInvalidStoredAuthError: (error: { name?: string; code?: string } | null) =>
    Boolean(error && (
      error.name === "AuthSessionMissingError" ||
      error.code === "refresh_token_not_found"
    )),
  safeAuthError: (error: { name?: string; code?: string }) => ({ name: error.name, code: error.code }),
}));

import { GET } from "./route";

describe("auth callback recovery", () => {
  const exchangeCodeForSession = vi.fn();
  const getUser = vi.fn();
  const client = { auth: { exchangeCodeForSession, getUser } };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(client);
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.clearLocalAuthState.mockResolvedValue(null);
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
  });

  it("keeps the newly exchanged session on success", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=valid&next=/alerts"));
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/alerts");
    expect(mocks.createClient).toHaveBeenCalledWith({ skipAuthInitialization: true });
    expect(mocks.clearLocalAuthState).not.toHaveBeenCalled();
  });

  it.each([
    ["expired magic link", "otp_expired"],
    ["already-used magic link", "otp_expired"],
    ["wrong PKCE verifier", "bad_code_verifier"],
    ["missing PKCE verifier", "pkce_code_verifier_not_found"],
  ])("clears auth state after an %s failure", async (_label, code) => {
    exchangeCodeForSession.mockResolvedValue({
      error: Object.assign(new Error(code), { name: "AuthApiError", code }),
    });
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=invalid"));
    expect(mocks.clearLocalAuthState).toHaveBeenCalledWith(client, mocks.cookieStore);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
  });

  it("clears an existing session when the callback has no code", async () => {
    const response = await GET(new NextRequest("https://oddsup.xyz/auth/callback"));
    expect(mocks.clearLocalAuthState).toHaveBeenCalledWith(client, mocks.cookieStore);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
  });

  it("passes the callback flow id so overlapping PKCE verifiers cannot be mixed", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=valid&sb_flow_id=a1b2c3d4"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid", { flowId: "a1b2c3d4" });
  });

  it("does not clear a newer valid session when an older callback fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: Object.assign(new Error("used"), { name: "AuthApiError", code: "otp_expired" }),
    });
    getUser.mockResolvedValue({ data: { user: { id: "newer-user" } }, error: null });

    const response = await GET(new NextRequest(
      "https://oddsup.xyz/auth/callback?code=older-used-code&sb_flow_id=a1b2c3d4",
    ));

    expect(mocks.clearLocalAuthState).not.toHaveBeenCalled();
    expect(mocks.expireSupabasePkceVerifierCookies).toHaveBeenCalledWith(
      mocks.cookieStore.getAll(),
      expect.any(Function),
      "a1b2c3d4",
    );
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
  });
});
