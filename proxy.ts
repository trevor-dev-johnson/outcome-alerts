import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

const VERCEL_DEPLOYMENT_HOST_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/;

export function isStagingVerificationRequest(
  requestUrl: string,
  enabled: string | undefined,
  vercelUrl: string | undefined,
) {
  if (enabled !== "true" || !vercelUrl || vercelUrl !== vercelUrl.trim()) return false;

  const deploymentHostname = vercelUrl.toLowerCase();
  if (!VERCEL_DEPLOYMENT_HOST_PATTERN.test(deploymentHostname)) return false;

  try {
    const request = new URL(requestUrl);
    return request.protocol === "https:" && request.hostname.toLowerCase() === deploymentHostname;
  } catch {
    return false;
  }
}

export function canonicalProductionUrl(
  requestUrl: string,
  appUrl: string | undefined,
  production: boolean,
  stagingVerification = false,
) {
  if (!production || !appUrl) return null;
  try {
    const request = new URL(requestUrl);
    const canonical = new URL(appUrl);
    if (request.origin === canonical.origin || stagingVerification) return null;
    return new URL(`${request.pathname}${request.search}`, canonical.origin);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const stagingVerification = isStagingVerificationRequest(
    request.url,
    process.env.ODDSUP_STAGING_VERIFICATION_ENABLED,
    process.env.VERCEL_URL,
  );
  const canonical = canonicalProductionUrl(
    request.url,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_ENV === "production",
    stagingVerification,
  );
  if (canonical) return NextResponse.redirect(canonical, 308);

  const response = hasSupabaseEnv()
    ? await updateSession(request)
    : NextResponse.next({ request });
  if (stagingVerification) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|llms.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
