import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INDEXNOW_ENDPOINT,
  getIndexablePublicUrls,
  normalizeIndexNowUrls,
  submitIndexNow,
} from "./indexnow";

const TEST_KEY = "test-indexnow-key-1234";

function responseFetch(status: number) {
  return vi.fn(async (...args: [string | URL | Request, RequestInit?]) => {
    void args;
    return new Response(null, { status });
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("IndexNow public URL allowlist", () => {
  it("derives canonical public URLs from the sitemap", () => {
    expect(getIndexablePublicUrls()).toEqual([
      "https://oddsup.xyz/",
      "https://oddsup.xyz/about",
      "https://oddsup.xyz/movers",
    ]);
  });

  it("normalizes and deduplicates allowed URLs", () => {
    expect(normalizeIndexNowUrls([
      "/",
      "https://oddsup.xyz/#intro",
      "/about?source=test",
      "https://oddsup.xyz/about",
    ])).toEqual({
      urls: ["https://oddsup.xyz/", "https://oddsup.xyz/about"],
      rejected: [],
    });
  });

  it.each(["/alerts", "/api/markets", "/auth/callback", "/login", "/markets", "/settings"])(
    "rejects private or non-indexable path %s",
    (input) => {
      expect(normalizeIndexNowUrls([input])).toEqual({
        urls: [],
        rejected: [{ input, reason: "not-indexable" }],
      });
    },
  );

  it("rejects external, credential-bearing, and invalid URLs", () => {
    expect(normalizeIndexNowUrls([
      "https://example.com/about",
      "https://attacker@oddsup.xyz/about",
      "https://%",
    ])).toEqual({
      urls: [],
      rejected: [
        { input: "https://example.com/about", reason: "external-origin" },
        { input: "https://attacker@oddsup.xyz/about", reason: "external-origin" },
        { input: "https://%", reason: "invalid-url" },
      ],
    });
  });
});

describe("IndexNow submission", () => {
  it("skips safely without a configured key or network request", async () => {
    const fetchMock = responseFetch(200);
    const result = await submitIndexNow(getIndexablePublicUrls(), {
      key: null,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      outcome: "skipped",
      reason: "missing-key",
      urls: getIndexablePublicUrls(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the standard bulk payload exactly once", async () => {
    const fetchMock = responseFetch(200);
    const result = await submitIndexNow(["/", "/about", "/about"], {
      key: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual({
      outcome: "accepted",
      status: 200,
      urls: ["https://oddsup.xyz/", "https://oddsup.xyz/about"],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe(INDEXNOW_ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      host: "oddsup.xyz",
      key: TEST_KEY,
      keyLocation: `https://oddsup.xyz/${TEST_KEY}.txt`,
      urlList: ["https://oddsup.xyz/", "https://oddsup.xyz/about"],
    });
  });

  it("accepts the initial-submission 202 response", async () => {
    const fetchMock = responseFetch(202);
    await expect(submitIndexNow(["/"], {
      key: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).resolves.toMatchObject({ outcome: "accepted", status: 202 });
  });

  it.each([
    [400, "bad-request"],
    [403, "key-verification-failed"],
    [422, "unprocessable"],
    [429, "rate-limited"],
    [500, "http-error"],
  ] as const)("maps HTTP %s to %s without retrying", async (status, reason) => {
    const fetchMock = responseFetch(status);
    const result = await submitIndexNow(["/"], {
      key: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ outcome: "failed", reason, status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a timeout result without throwing or retrying", async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const result = await submitIndexNow(["/"], {
      key: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ outcome: "failed", reason: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a mixed valid/private batch before any request", async () => {
    const fetchMock = responseFetch(200);
    const result = await submitIndexNow(["/", "/alerts"], {
      key: TEST_KEY,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ outcome: "rejected", reason: "invalid-urls" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed keys before any request", async () => {
    const fetchMock = responseFetch(200);
    const result = await submitIndexNow(["/"], {
      key: "not valid!",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ outcome: "rejected", reason: "invalid-key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
