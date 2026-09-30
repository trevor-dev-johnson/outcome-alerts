import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const TEST_KEY = "test-indexnow-key-1234";

afterEach(() => {
  vi.unstubAllEnvs();
});

function requestKey(key: string) {
  return GET(new Request(`https://oddsup.xyz/${key}.txt`), {
    params: Promise.resolve({ key }),
  });
}

describe("IndexNow key file", () => {
  it("serves only the configured valid key as plain text", async () => {
    vi.stubEnv("INDEXNOW_KEY", TEST_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-exposed");

    const response = await requestKey(TEST_KEY);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(TEST_KEY);
  });

  it("does not expose a different environment value", async () => {
    vi.stubEnv("INDEXNOW_KEY", TEST_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-exposed");

    const response = await requestKey("must-not-be-exposed");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("must-not-be-exposed");
  });

  it("does not expose the key from the internal rewrite destination", async () => {
    vi.stubEnv("INDEXNOW_KEY", TEST_KEY);
    const response = await GET(
      new Request(`https://oddsup.xyz/indexnow-key/${TEST_KEY}`),
      { params: Promise.resolve({ key: TEST_KEY }) },
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for a missing, malformed, or mismatched configured key", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    expect((await requestKey(TEST_KEY)).status).toBe(404);

    vi.stubEnv("INDEXNOW_KEY", "invalid key");
    expect((await requestKey("invalid-key")).status).toBe(404);

    vi.stubEnv("INDEXNOW_KEY", TEST_KEY);
    expect((await requestKey("another-valid-key")).status).toBe(404);
  });
});
