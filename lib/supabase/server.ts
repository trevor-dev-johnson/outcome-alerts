import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type ServerClientOptions = { skipAuthInitialization?: boolean };

export async function createClient(options: ServerClientOptions = {}) {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        experimental: { appendPkceFlowIdToRedirects: true },
        skipAutoInitialize: options.skipAuthInitialization,
      },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
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
