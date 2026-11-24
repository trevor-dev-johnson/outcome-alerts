import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { hasSupabaseEnvMock, updateSessionMock } = vi.hoisted(() => ({
  hasSupabaseEnvMock: vi.fn(),
  updateSessionMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ hasSupabaseEnv: hasSupabaseEnvMock }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: updateSessionMock }));

import {
  canonicalProductionUrl,
  isStagingVerificationRequest,
  proxy,
} from "./proxy";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  hasSupabaseEnvMock.mockReturnValue(false);
  updateSessionMock.mockImplementation((request: NextRequest) => {
    const response = NextResponse.next({ request });
    response.headers.set("x-session-middleware", "preserved");
    return response;
  });
});

describe("canonical production origin", () => {
  it("redirects alternate production hosts while preserving path and query", () => {
    expect(canonicalProductionUrl(
      "https://outcome-alerts.vercel.app/alerts?status=active",
      "https://oddsup.xyz",
      true,
    )?.toString()).toBe("https://oddsup.xyz/alerts?status=active");
  });

  it("does not redirect the canonical host or non-production environments", () => {
    expect(canonicalProductionUrl("https://oddsup.xyz/alerts", "https://oddsup.xyz", true)).toBeNull();
    expect(canonicalProductionUrl("http://localhost:3000/alerts", "https://oddsup.xyz", false)).toBeNull();
  });

  it("permits only the exact Vercel deployment host when explicitly enabled", () => {
    const deploymentHost = "oddsup-abc123-tjohnsonaces-projects.vercel.app";
    expect(isStagingVerificationRequest(
      `https://${deploymentHost}/movers?window=5m`,
      "true",
      deploymentHost,
    )).toBe(true);
    expect(isStagingVerificationRequest(
      "https://another-deployment.vercel.app/movers",
      "true",
      deploymentHost,
    )).toBe(false);
    expect(isStagingVerificationRequest(
      `https://${deploymentHost}/movers`,
      undefined,
      deploymentHost,
    )).toBe(false);
  });

  it.each([undefined, "", "TRUE", "1", "false"])(
    "fails closed for missing or malformed staging flag %s",
    (enabled) => {
      const deploymentHost = "oddsup-abc123-tjohnsonaces-projects.vercel.app";
      expect(isStagingVerificationRequest(
        `https://${deploymentHost}/movers`,
        enabled,
        deploymentHost,
      )).toBe(false);
    },
  );

  it.each([
    "https://oddsup-example.vercel.app",
    "oddsup-example.vercel.app/path",
    "oddsup-example.vercel.app:443",
    " oddsup-example.vercel.app",
    "oddsup.example.com",
  ])("fails closed for malformed VERCEL_URL value %s", (vercelUrl) => {
    expect(isStagingVerificationRequest(
      "https://oddsup-example.vercel.app/movers",
      "true",
      vercelUrl,
    )).toBe(false);
  });

  it("continues through session middleware and marks staging responses noindex", async () => {
    const deploymentHost = "oddsup-abc123-tjohnsonaces-projects.vercel.app";
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://oddsup.xyz");
    vi.stubEnv("ODDSUP_STAGING_VERIFICATION_ENABLED", "true");
    vi.stubEnv("VERCEL_URL", deploymentHost);
    hasSupabaseEnvMock.mockReturnValue(true);

    const request = new NextRequest(`https://${deploymentHost}/movers?window=1h`);
    const response = await proxy(request);

    expect(updateSessionMock).toHaveBeenCalledOnce();
    expect(updateSessionMock).toHaveBeenCalledWith(request);
    expect(response.headers.get("x-session-middleware")).toBe("preserved");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects arbitrary hosts without running session middleware", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://oddsup.xyz");
    vi.stubEnv("ODDSUP_STAGING_VERIFICATION_ENABLED", "true");
    vi.stubEnv("VERCEL_URL", "oddsup-abc123-tjohnsonaces-projects.vercel.app");
    hasSupabaseEnvMock.mockReturnValue(true);

    const response = await proxy(new NextRequest("https://other.vercel.app/movers?window=24h"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://oddsup.xyz/movers?window=24h");
    expect(response.headers.get("x-robots-tag")).toBeNull();
    expect(updateSessionMock).not.toHaveBeenCalled();
  });
});
