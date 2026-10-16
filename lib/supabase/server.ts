import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseSessionCookie } from "@/lib/supabase/auth-state";

type ServerClientOptions = {
  skipAuthInitialization?: boolean;
  sessionCookiesOnly?: boolean;
  pkceExchangeOnly?: boolean;
};

export async function createClient(options: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  // Session validation may invoke SDK teardown, which also removes every PKCE
  // verifier it can see. Recovery must not give it access to pending logins.
  const acceptsCookie = (name: string) => !options.sessionCookiesOnly || isSupabaseSessionCookie(name);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        experimental: { appendPkceFlowIdToRedirects: true },
        skipAutoInitialize: options.skipAuthInitialization,
      },
      cookies: {
        // onAuthStateChange reads the initial session even with automatic
        // initialization disabled. During exchange, hide the old session so
        // its teardown cannot race with PKCE; still allow the new session write.
        getAll: () => cookieStore.getAll().filter(({ name }) => acceptsCookie(name) && (
          !options.pkceExchangeOnly || !isSupabaseSessionCookie(name)
        )),
        setAll(cookiesToSet) {
          try {
            if (options.pkceExchangeOnly && cookiesToSet.some(({ name, value }) =>
              isSupabaseSessionCookie(name) && value,
            )) {
              // The exchange view hid the previous session's chunks. Remove
              // obsolete chunks only when a successful exchange writes a new
              // session, never on a failed or missing-code callback.
              const writtenNames = new Set(cookiesToSet.map(({ name }) => name));
              cookieStore.getAll().forEach(({ name }) => {
                if (isSupabaseSessionCookie(name) && !writtenNames.has(name)) {
                  cookieStore.set(name, "", { maxAge: 0, path: "/" });
                }
              });
            }
            cookiesToSet.filter(({ name }) => acceptsCookie(name)).forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot write cookies. proxy.ts refreshes sessions.
          }
        },
      },
    },
  );
}
