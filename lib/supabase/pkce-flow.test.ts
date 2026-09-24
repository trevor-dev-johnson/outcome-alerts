import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { expireSupabasePkceVerifierCookies } from "./auth-state";
import { updateSession } from "./proxy";

type StoredCookie = { name: string; value: string };

describe("installed Supabase PKCE flow isolation", () => {
  it("preserves a pending verifier through the intervening anonymous request", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
    const cookieJar = new Map<string, string>();
    let flowId: string | null = null;
    let exchangedVerifier: string | null = null;
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/otp")) {
        const redirectTo = new URL(url).searchParams.get("redirect_to")!;
        flowId = new URL(redirectTo).searchParams.get("sb_flow_id");
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/token?grant_type=pkce")) {
        const body = JSON.parse(String(init?.body)) as { code_verifier?: string };
        exchangedVerifier = body.code_verifier ?? null;
        return Response.json({
          access_token: "header.payload.signature",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh-token",
          user: {
            id: "00000000-0000-4000-8000-000000000001",
            aud: "authenticated",
            role: "authenticated",
            email: "test@example.com",
            app_metadata: {},
            user_metadata: {},
            identities: [],
            created_at: "2026-01-01T00:00:00.000Z",
          },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const createClient = () => createServerClient(
      "https://project-ref.supabase.co",
      "publishable",
      {
        global: { fetch },
        auth: {
          experimental: { appendPkceFlowIdToRedirects: true },
          skipAutoInitialize: true,
        },
        cookies: {
          getAll: () => [...cookieJar].map(([name, value]) => ({ name, value } satisfies StoredCookie)),
          setAll: (cookies) => {
            cookies.forEach(({ name, value, options }) => {
              if (!value || options?.maxAge === 0) cookieJar.delete(name);
              else cookieJar.set(name, value);
            });
          },
        },
      },
    );

    await createClient().auth.signInWithOtp({
      email: "test@example.com",
      options: { emailRedirectTo: "https://oddsup.xyz/auth/callback?next=/markets" },
    });
    expect(flowId).toMatch(/^[a-z0-9_-]{8,64}$/i);
    const verifierName = `sb-project-ref-auth-token-flow-${flowId}-code-verifier`;
    expect(cookieJar.has(verifierName)).toBe(true);

    const request = new NextRequest("https://oddsup.xyz/", {
      headers: {
        cookie: [...cookieJar].map(([name, value]) => `${name}=${value}`).join("; "),
      },
    });
    const middlewareResponse = await updateSession(request);
    expect(middlewareResponse.headers.get("location")).toBeNull();
    expect(middlewareResponse.headers.get("set-cookie")).toBeNull();
    expect(cookieJar.has(verifierName)).toBe(true);

    const { error } = await createClient().auth.exchangeCodeForSession("fresh-code", {
      flowId: flowId!,
    });
    expect(error).toBeNull();
    expect(exchangedVerifier).toBeTruthy();
    expect(cookieJar.has(verifierName)).toBe(false);
    expect(cookieJar.has("sb-project-ref-auth-token")).toBe(true);
  });

  it("keeps overlapping verifier slots separate and removes only the failed flow", async () => {
    const cookieJar = new Map<string, string>();
    const otpRequestUrls: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/otp")) {
        otpRequestUrls.push(url);
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(
        JSON.stringify({ code: "otp_expired", msg: "Email link is invalid or has expired" }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
            "x-supabase-api-version": "2024-01-01",
          },
        },
      );
    };
    const client = createServerClient("https://project-ref.supabase.co", "publishable", {
      global: { fetch },
      auth: {
        experimental: { appendPkceFlowIdToRedirects: true },
        skipAutoInitialize: true,
      },
      cookies: {
        getAll: () => [...cookieJar].map(([name, value]) => ({ name, value } satisfies StoredCookie)),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            if (!value || options?.maxAge === 0) cookieJar.delete(name);
            else cookieJar.set(name, value);
          });
        },
      },
    });

    await client.auth.signInWithOtp({
      email: "first@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });
    await client.auth.signInWithOtp({
      email: "second@example.com",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
    });

    const flowIds = otpRequestUrls.map((requestUrl) =>
      new URL(new URL(requestUrl).searchParams.get("redirect_to")!).searchParams.get("sb_flow_id"),
    );
    expect(flowIds).toHaveLength(2);
    expect(flowIds[0]).toMatch(/^[a-z0-9_-]{8,64}$/i);
    expect(flowIds[1]).toMatch(/^[a-z0-9_-]{8,64}$/i);
    expect(flowIds[0]).not.toBe(flowIds[1]);
    expect([...cookieJar.keys()]).toContain(
      `sb-project-ref-auth-token-flow-${flowIds[0]}-code-verifier`,
    );
    expect([...cookieJar.keys()]).toContain(
      `sb-project-ref-auth-token-flow-${flowIds[1]}-code-verifier`,
    );

    const { error } = await client.auth.exchangeCodeForSession("already-used", {
      flowId: flowIds[0]!,
    });
    expect(error?.code).toBe("otp_expired");
    expireSupabasePkceVerifierCookies(
      [...cookieJar].map(([name, value]) => ({ name, value })),
      (name, value, options) => {
        if (!value || options.maxAge === 0) cookieJar.delete(name);
        else cookieJar.set(name, value);
      },
      flowIds[0],
      "https://project-ref.supabase.co",
    );
    expect([...cookieJar.keys()]).not.toContain(
      `sb-project-ref-auth-token-flow-${flowIds[0]}-code-verifier`,
    );
    expect([...cookieJar.keys()]).toContain(
      `sb-project-ref-auth-token-flow-${flowIds[1]}-code-verifier`,
    );
  });
});
