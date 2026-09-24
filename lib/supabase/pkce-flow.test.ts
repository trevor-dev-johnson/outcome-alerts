import { createServerClient } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { expireSupabasePkceVerifierCookies } from "./auth-state";

type StoredCookie = { name: string; value: string };

describe("installed Supabase PKCE flow isolation", () => {
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
