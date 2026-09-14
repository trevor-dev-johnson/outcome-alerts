const INTERNAL_ORIGIN = "https://oddsup.invalid";

export function safeInternalPath(value: string | null | undefined, fallback = "/markets") {
  if (!value) return fallback;

  try {
    const resolved = new URL(value, INTERNAL_ORIGIN);
    if (resolved.origin !== INTERNAL_ORIGIN) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

