import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  expireSupabaseAuthCookies,
  hasSupabaseAuthCookies,
  isInvalidStoredAuthError,
  safeAuthError,
} from "@/lib/supabase/auth-state";

export function shouldRedirectAuthenticatedUser(pathname: string, authError: string | null) {
  const failedAuthCallback =
    pathname === "/login" && (authError === "auth" || authError === "session-expired");
  return !failedAuthCallback && (pathname === "/login" || pathname === "/");
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // The callback owns PKCE exchange and cleanup. Reading the old session here can
  // discard the verifier before the one-time code has a chance to use it.
  if (pathname === "/auth/callback") return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const authStartedAt = performance.now();
  let user = null;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (error) {
    authError = error;
  }

  const finishAuthTiming = (timedResponse: NextResponse, outcome: string) => {
    const durationMs = Math.round(performance.now() - authStartedAt);
    timedResponse.headers.append("server-timing", `supabase-auth;dur=${durationMs}`);
    console.info("supabase_auth_timing", { pathname, durationMs, outcome });
    return timedResponse;
  };

  const requestCookies = request.cookies.getAll();
  if (
    authError &&
    hasSupabaseAuthCookies(requestCookies) &&
    isInvalidStoredAuthError(authError)
  ) {
    console.warn("Invalid Supabase browser auth state", safeAuthError(authError));
    const alreadyRecovering =
      pathname === "/login" && request.nextUrl.searchParams.get("error") === "session-expired";
    if (!alreadyRecovering) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "session-expired");
      response = NextResponse.redirect(url);
    }
    expireSupabaseAuthCookies(
      requestCookies,
      (name, value, options) => response.cookies.set(name, value, options),
    );
    return finishAuthTiming(response, "invalid-session");
  }

  const protectedPath = ["/markets", "/alerts", "/settings"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!user && protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return finishAuthTiming(NextResponse.redirect(url), "anonymous-redirect");
  }
  if (user && shouldRedirectAuthenticatedUser(pathname, request.nextUrl.searchParams.get("error"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/markets";
    return finishAuthTiming(NextResponse.redirect(url), "authenticated-redirect");
  }
  return finishAuthTiming(response, user ? "authenticated" : authError ? "auth-error" : "anonymous");
}
