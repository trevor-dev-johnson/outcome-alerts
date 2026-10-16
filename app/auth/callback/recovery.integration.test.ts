import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...state.jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (!value || options?.maxAge === 0) state.jar.delete(name);
      else state.jar.set(name, value);
    },
  }),
}));

import { createClient } from "@/lib/supabase/server";
import { updateSession } from "@/lib/supabase/proxy";
import { GET } from "./route";

const key = "sb-project-ref-auth-token";
const user = {
  id: "00000000-0000-4000-8000-000000000001", aud: "authenticated",
  role: "authenticated", app_metadata: {}, user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = () => ({
  access_token: "header.payload.signature", refresh_token: "test-refresh",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer", user,
});
const authFailure = (code: string) => Response.json({ code, msg: code }, {
  status: 400, headers: { "x-supabase-api-version": "2024-01-01" },
});

describe("callback recovery with installed Supabase SDK and SSR cookie adapter", () => {
  let flows: { redirect: URL; challenge: string }[];
  let expiredCodes: Set<string>;

  beforeEach(() => {
    state.jar.clear();
    state.jar.set("sb-another-ref-auth-token.0", "other-project");
    state.jar.set("theme", "dark");
    flows = [];
    expiredCodes = new Set(["0"]);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (url.pathname.endsWith("/otp")) {
        flows.push({ redirect: new URL(url.searchParams.get("redirect_to")!), challenge: body.code_challenge });
        return Response.json({});
      }
      if (url.searchParams.get("grant_type") === "pkce") {
        const flow = flows[Number(body.auth_code)];
        const challenge = createHash("sha256").update(body.code_verifier).digest("base64url");
        if (!flow || flow.challenge !== challenge) return authFailure("bad_code_verifier");
        if (expiredCodes.has(body.auth_code)) return authFailure("otp_expired");
        expiredCodes.add(body.auth_code);
        return Response.json(session());
      }
      if (url.searchParams.get("grant_type") === "refresh_token") return authFailure("refresh_token_not_found");
      if (url.pathname.endsWith("/user")) return Response.json(user);
      throw new Error(`Unexpected test auth request: ${url.pathname}`);
    }));
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function startFlow() {
    const client = await createClient({ skipAuthInitialization: true });
    const result = await client.auth.signInWithOtp({
      email: "test@example.com",
      options: { emailRedirectTo: "https://oddsup.xyz/auth/callback?next=%2Fmarkets%2F7637" },
    });
    expect(result.error).toBeNull();
    return flows.length - 1;
  }
  const verifierKey = (index: number) => `${key}-flow-${flows[index].redirect.searchParams.get("sb_flow_id")}-code-verifier`;
  async function callback(index: number) {
    const url = new URL(flows[index].redirect);
    url.searchParams.set("code", String(index));
    return GET(new NextRequest(url));
  }

  it.each(["absent", "malformed", "expired"])("failed A preserves B with an %s session, then B signs in", async (kind) => {
    await startFlow();
    await startFlow();
    const verifierB = state.jar.get(verifierKey(1));
    if (kind === "malformed") state.jar.set(key, "{}");
    if (kind === "expired") state.jar.set(key, JSON.stringify({ ...session(), expires_at: 1 }));
    const failed = await callback(0);
    expect(failed.headers.get("location")).toBe("https://oddsup.xyz/login?error=session-expired");
    expect(state.jar.has(verifierKey(0))).toBe(false);
    expect(state.jar.get(verifierKey(1))).toBe(verifierB);
    expect(state.jar.has(key)).toBe(false);
    expect(state.jar.get("sb-another-ref-auth-token.0")).toBe("other-project");
    expect(state.jar.get("theme")).toBe("dark");
    const success = await callback(1);
    expect(success.headers.get("location")).toBe("https://oddsup.xyz/markets/7637");
    expect(state.jar.has(key)).toBe(true);
    expect(state.jar.has(verifierKey(1))).toBe(false);
  });

  it("preserves a newer successful session and pending C when old A fails", async () => {
    await startFlow(); await startFlow();
    await callback(1);
    const validSession = state.jar.get(key);
    await startFlow();
    const verifierC = state.jar.get(verifierKey(2));
    await callback(0);
    expect(state.jar.get(key)).toBe(validSession);
    expect(state.jar.get(verifierKey(2))).toBe(verifierC);
    expect((await callback(2)).headers.get("location")).toBe("https://oddsup.xyz/markets/7637");
  });

  it("middleware invalid-session SDK cleanup preserves all pending flows", async () => {
    await startFlow(); await startFlow();
    state.jar.set(key, "{}");
    const before = new Map(state.jar);
    const response = await updateSession(new NextRequest("https://oddsup.xyz/login?error=session-expired", {
      headers: { cookie: [...state.jar].map(([name, value]) => `${name}=${value}`).join("; ") },
    }));
    response.cookies.getAll().forEach(({ name, value, maxAge }) => {
      if (!value || maxAge === 0) state.jar.delete(name);
      else state.jar.set(name, value);
    });
    expect(state.jar.has(key)).toBe(false);
    for (const [name, value] of before) {
      if (name !== key) expect(state.jar.get(name), name).toBe(value);
    }
    expect((await callback(1)).headers.get("location")).toBe("https://oddsup.xyz/markets/7637");
  });

  it("replaces old session chunks only after a successful exchange", async () => {
    await startFlow(); await startFlow();
    const oldSession = JSON.stringify(session());
    state.jar.set(`${key}.0`, oldSession.slice(0, 40));
    state.jar.set(`${key}.1`, oldSession.slice(40));
    await callback(0);
    expect(state.jar.get(`${key}.0`)).toBe(oldSession.slice(0, 40));
    expect(state.jar.get(`${key}.1`)).toBe(oldSession.slice(40));
    await callback(1);
    expect(state.jar.has(`${key}.0`)).toBe(false);
    expect(state.jar.has(`${key}.1`)).toBe(false);
    expect(state.jar.has(key)).toBe(true);
    expect(state.jar.get("sb-another-ref-auth-token.0")).toBe("other-project");
  });

  it("invalid explicit flow IDs cannot consume the pending legacy alias or slot", async () => {
    await startFlow();
    const before = new Map(state.jar);
    await GET(new NextRequest("https://oddsup.xyz/auth/callback?code=0&sb_flow_id=bad"));
    expect(state.jar).toEqual(before);
  });

  it("keeps the SDK OAuth PKCE callback compatible without enabling a provider", async () => {
    await startFlow();
    const client = await createClient({ skipAuthInitialization: true });
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://oddsup.xyz/auth/callback?next=%2Fmarkets%2F7637",
        skipBrowserRedirect: true,
      },
    });
    expect(error).toBeNull();
    const authorizeUrl = new URL(data.url!);
    flows.push({
      redirect: new URL(authorizeUrl.searchParams.get("redirect_to")!),
      challenge: authorizeUrl.searchParams.get("code_challenge")!,
    });
    const oauthVerifier = state.jar.get(verifierKey(1));
    expect(oauthVerifier).toBeTruthy();
    await callback(0);
    expect(state.jar.get(verifierKey(1))).toBe(oauthVerifier);
    expect((await callback(1)).headers.get("location")).toBe("https://oddsup.xyz/markets/7637");
    expect(state.jar.has(key)).toBe(true);
  });
});
