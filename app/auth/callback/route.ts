import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { clearLocalSession } from "@/lib/supabase/session";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    await clearLocalSession(supabase);
  } else {
    const supabase = await createClient();
    await clearLocalSession(supabase);
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
