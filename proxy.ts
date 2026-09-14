import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

export function canonicalProductionUrl(requestUrl: string, appUrl: string | undefined, production: boolean) {
  if (!production || !appUrl) return null;
  try {
    const request = new URL(requestUrl);
    const canonical = new URL(appUrl);
    if (request.origin === canonical.origin) return null;
    return new URL(`${request.pathname}${request.search}`, canonical.origin);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const canonical = canonicalProductionUrl(
    request.url,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_ENV === "production",
  );
  if (canonical) return NextResponse.redirect(canonical, 308);
  if (!hasSupabaseEnv()) return;
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
