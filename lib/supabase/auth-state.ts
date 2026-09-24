import { clearLocalSession, type LocalSignOutClient } from "@/lib/supabase/session";

type Cookie = { name: string; value?: string };

export type MutableCookieStore = {
  getAll(): Cookie[];
  set(name: string, value: string, options: { maxAge: number; path: string }): unknown;
};

export function supabaseAuthStorageKey(supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (!supabaseUrl) return null;
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : null;
  } catch {
    return null;
  }
}

export function isSupabaseAuthCookie(name: string, supabaseUrl?: string) {
  const storageKey = supabaseAuthStorageKey(supabaseUrl);
  if (!storageKey) return false;
  return name === storageKey || name.startsWith(`${storageKey}.`) || name.startsWith(`${storageKey}-`);
}

export function hasSupabaseAuthCookies(cookies: Cookie[], supabaseUrl?: string) {
  return cookies.some(({ name }) => isSupabaseAuthCookie(name, supabaseUrl));
}

export function expireSupabaseAuthCookies(
  cookies: Cookie[],
  setCookie: (name: string, value: string, options: { maxAge: number; path: string }) => unknown,
  supabaseUrl?: string,
) {
  const names = new Set(
    cookies.filter(({ name }) => isSupabaseAuthCookie(name, supabaseUrl)).map(({ name }) => name),
  );
  names.forEach((name) => setCookie(name, "", { maxAge: 0, path: "/" }));
  return [...names];
}

export function expireSupabasePkceVerifierCookies(
  cookies: Cookie[],
  setCookie: (name: string, value: string, options: { maxAge: number; path: string }) => unknown,
  flowId: string | null,
  supabaseUrl?: string,
) {
  const storageKey = supabaseAuthStorageKey(supabaseUrl);
  if (!storageKey) return [];
  const validFlowId = flowId && /^[a-z0-9_-]{8,64}$/i.test(flowId) ? flowId : null;
  const verifierKey = validFlowId
    ? `${storageKey}-flow-${validFlowId}-code-verifier`
    : `${storageKey}-code-verifier`;
  const names = new Set(
    cookies
      .filter(({ name }) => name === verifierKey || name.startsWith(`${verifierKey}.`))
      .map(({ name }) => name),
  );
  names.forEach((name) => setCookie(name, "", { maxAge: 0, path: "/" }));
  return [...names];
}

export async function clearLocalAuthState(
  client: LocalSignOutClient,
  cookieStore: MutableCookieStore,
  supabaseUrl?: string,
) {
  const cookiesBeforeSignOut = cookieStore.getAll();
  const signOutError = await clearLocalSession(client);
  expireSupabaseAuthCookies(
    cookiesBeforeSignOut,
    (name, value, options) => cookieStore.set(name, value, options),
    supabaseUrl,
  );
  return signOutError;
}

export function safeAuthError(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownAuthError" };
  const value = error as { name?: unknown; code?: unknown; status?: unknown };
  return {
    name: typeof value.name === "string" ? value.name : "UnknownAuthError",
    ...(typeof value.code === "string" ? { code: value.code } : {}),
    ...(typeof value.status === "number" ? { status: value.status } : {}),
  };
}

const INVALID_AUTH_CODES = new Set([
  "bad_jwt",
  "invalid_jwt",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
  "session_not_found",
]);

const INVALID_AUTH_ERROR_NAMES = new Set([
  "AuthInvalidJwtError",
  "AuthInvalidTokenResponseError",
  "AuthSessionMissingError",
  "SyntaxError",
]);

export function isInvalidStoredAuthError(error: unknown) {
  const details = safeAuthError(error);
  return INVALID_AUTH_ERROR_NAMES.has(details.name) || Boolean(details.code && INVALID_AUTH_CODES.has(details.code));
}
