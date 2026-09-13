import { createClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

export function createAdminClient() {
  return createClient(
    requireServerEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
