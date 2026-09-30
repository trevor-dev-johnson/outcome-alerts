import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/site";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_TIMEOUT_MS = 5_000;

const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export type RejectedIndexNowUrl = {
  input: string;
  reason: "invalid-url" | "external-origin" | "not-indexable";
};

export type IndexNowResult =
  | {
      outcome: "accepted";
      status: 200 | 202;
      urls: string[];
    }
  | {
      outcome: "skipped";
      reason: "missing-key";
      urls: string[];
    }
  | {
      outcome: "rejected";
      reason: "invalid-key" | "invalid-urls" | "no-urls";
      urls: string[];
      rejected?: RejectedIndexNowUrl[];
    }
  | {
      outcome: "failed";
      reason:
        | "bad-request"
        | "key-verification-failed"
        | "unprocessable"
        | "rate-limited"
        | "http-error"
        | "timeout"
        | "network-error";
      status?: number;
      urls: string[];
    };

export function getIndexablePublicUrls(): string[] {
  return sitemap().map(({ url }) => url);
}

export function getIndexNowKey(value = process.env.INDEXNOW_KEY): string | null {
  const key = value?.trim();
  return key && INDEXNOW_KEY_PATTERN.test(key) ? key : null;
}

export function normalizeIndexNowUrls(values: readonly string[]): {
  urls: string[];
  rejected: RejectedIndexNowUrl[];
} {
  const canonicalByPath = new Map(
    getIndexablePublicUrls().map((url) => {
      const parsed = new URL(url);
      return [parsed.pathname, parsed.href] as const;
    }),
  );
  const allowedOrigin = new URL(SITE_URL).origin;
  const urls = new Set<string>();
  const rejected: RejectedIndexNowUrl[] = [];

  for (const input of values) {
    let parsed: URL;

    try {
      parsed = new URL(input, `${SITE_URL}/`);
    } catch {
      rejected.push({ input, reason: "invalid-url" });
      continue;
    }

    if (parsed.origin !== allowedOrigin || parsed.username || parsed.password) {
      rejected.push({ input, reason: "external-origin" });
      continue;
    }

    const canonical = canonicalByPath.get(parsed.pathname);
    if (!canonical) {
      rejected.push({ input, reason: "not-indexable" });
      continue;
    }

    urls.add(canonical);
  }

  return { urls: [...urls], rejected };
}

type SubmitIndexNowOptions = {
  key?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function submitIndexNow(
  values: readonly string[],
  options: SubmitIndexNowOptions = {},
): Promise<IndexNowResult> {
  const { urls, rejected } = normalizeIndexNowUrls(values);

  if (rejected.length > 0) {
    return { outcome: "rejected", reason: "invalid-urls", urls, rejected };
  }

  if (urls.length === 0) {
    return { outcome: "rejected", reason: "no-urls", urls };
  }

  const configuredKey = options.key === undefined ? process.env.INDEXNOW_KEY : options.key;
  if (!configuredKey?.trim()) {
    return { outcome: "skipped", reason: "missing-key", urls };
  }

  const key = getIndexNowKey(configuredKey);
  if (!key) {
    return { outcome: "rejected", reason: "invalid-key", urls };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? INDEXNOW_TIMEOUT_MS;

  try {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE_URL).hostname,
        key,
        keyLocation: `${SITE_URL}/${key}.txt`,
        urlList: urls,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 200 || response.status === 202) {
      return { outcome: "accepted", status: response.status, urls };
    }

    const reasons: Partial<Record<number, Extract<IndexNowResult, { outcome: "failed" }>["reason"]>> = {
      400: "bad-request",
      403: "key-verification-failed",
      422: "unprocessable",
      429: "rate-limited",
    };

    return {
      outcome: "failed",
      reason: reasons[response.status] ?? "http-error",
      status: response.status,
      urls,
    };
  } catch (error) {
    const isTimeout = error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      outcome: "failed",
      reason: isTimeout ? "timeout" : "network-error",
      urls,
    };
  }
}
