import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { safeInternalPath } from "@/lib/safe-redirect";
import {
  clearLocalAuthState,
  expireSupabasePkceVerifierCookies,
  isInvalidStoredAuthError,
  safeAuthError,
} from "@/lib/supabase/auth-state";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const next = safeInternalPath(url.searchParams.get("next"));
  const supabase = await createClient({ skipAuthInitialization: true });
  const cookieStore = await cookies();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    console.warn("Supabase auth callback failed", safeAuthError(error));
  }

  expireSupabasePkceVerifierCookies(
    cookieStore.getAll(),
    (name, value, options) => cookieStore.set(name, value, options),
    flowId,
  );

  // A stale/reused link can arrive after another tab has already established a
  // newer valid session. Preserve that session; only purge state that is absent
  // or independently proven invalid. The failed flow's verifier is removed by
  // exchangeCodeForSession without weakening PKCE validation.
  try {
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (!user && (!sessionError || isInvalidStoredAuthError(sessionError))) {
      await clearLocalAuthState(supabase, cookieStore);
    }
  } catch (sessionError) {
    if (isInvalidStoredAuthError(sessionError)) {
      await clearLocalAuthState(supabase, cookieStore);
    }
  }
  return NextResponse.redirect(new URL("/login?error=session-expired", url.origin));
}
