export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep: (delayMs: number) => Promise<void>;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const TRANSIENT_MESSAGE = /timeout|timed out|gateway|temporar|fetch failed|network|econnreset|econnrefused|socket|rate limit/i;

export function isTransientSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return TRANSIENT_MESSAGE.test(String(error));

  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  const status = Number(candidate.status);
  if (status === 408 || status === 429 || status >= 500) return true;

  const code = String(candidate.code ?? "");
  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) return true;

  return TRANSIENT_MESSAGE.test(String(candidate.message ?? error));
}

const defaultSleep = (delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export const defaultSupabaseRetryOptions: RetryOptions = {
  maxAttempts: 4,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
  sleep: defaultSleep,
  shouldRetry: isTransientSupabaseError,
};

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 1;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= options.maxAttempts || !options.shouldRetry(error)) throw error;
      const delayMs = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.(error, attempt, delayMs);
      await options.sleep(delayMs);
      attempt += 1;
    }
  }
}

