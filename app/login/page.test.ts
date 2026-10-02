import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loginForm: vi.fn(({ next }: { next: string }) =>
    createElement("form", { "data-next": next }),
  ),
}));

vi.mock("@/lib/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("./login-form", () => ({ LoginForm: mocks.loginForm }));

import LoginPage from "./page";

describe("login return destination", () => {
  it.each([
    ["market detail", "/markets/7637", "/markets/7637"],
    ["Movers window", "/movers?window=5m", "/movers?window=5m"],
    ["external URL", "https://example.com/phish", "/markets"],
    ["protocol-relative URL", "//example.com/phish", "/markets"],
    ["missing destination", undefined, "/markets"],
  ])("passes a safe destination to the form for %s", async (_label, requested, expected) => {
    const page = await LoginPage({
      searchParams: Promise.resolve(requested ? { next: requested } : {}),
    });

    const html = renderToStaticMarkup(page);

    expect(html).toContain(`data-next="${expected.replaceAll("&", "&amp;")}"`);
  });
});
