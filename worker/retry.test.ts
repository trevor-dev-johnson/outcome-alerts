import { describe, expect, it, vi } from "vitest";
import { defaultSupabaseRetryOptions, isTransientSupabaseError, withRetry } from "./retry";

function options(overrides: Partial<typeof defaultSupabaseRetryOptions> = {}) {
  return {
    ...defaultSupabaseRetryOptions,
    baseDelayMs: 10,
    maxDelayMs: 25,
    sleep: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("withRetry", () => {
  it("retries transient failures with bounded exponential backoff", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ status: 504, message: "Gateway Timeout" })
      .mockRejectedValueOnce({ code: "ETIMEDOUT", message: "socket timed out" })
      .mockResolvedValue("ok");
    const retryOptions = options();

    await expect(withRetry(operation, retryOptions)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(retryOptions.sleep).toHaveBeenNthCalledWith(1, 10);
    expect(retryOptions.sleep).toHaveBeenNthCalledWith(2, 20);
  });

  it("stops after the configured maximum attempt count", async () => {
    const failure = { status: 503, message: "Temporarily unavailable" };
    const operation = vi.fn().mockRejectedValue(failure);
    const retryOptions = options({ maxAttempts: 4 });

    await expect(withRetry(operation, retryOptions)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(4);
    expect(retryOptions.sleep).toHaveBeenNthCalledWith(3, 25);
  });

  it("does not retry permanent Supabase errors", async () => {
    const failure = { status: 400, code: "PGRST100", message: "Bad request" };
    const operation = vi.fn().mockRejectedValue(failure);
    const retryOptions = options();

    await expect(withRetry(operation, retryOptions)).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(retryOptions.sleep).not.toHaveBeenCalled();
  });
});

describe("isTransientSupabaseError", () => {
  it("recognizes status, network-code, and message-based transient errors", () => {
    expect(isTransientSupabaseError({ status: 429 })).toBe(true);
    expect(isTransientSupabaseError({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientSupabaseError({ message: "Gateway Timeout" })).toBe(true);
    expect(isTransientSupabaseError({ status: 401, message: "Invalid API key" })).toBe(false);
  });
});

