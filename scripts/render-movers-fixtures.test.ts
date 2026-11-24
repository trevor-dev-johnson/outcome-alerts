import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), viewer: vi.fn() }));

vi.mock("@/lib/movers-data", () => ({ getMoversSnapshot: mocks.snapshot }));
vi.mock("@/lib/auth", () => ({ getViewer: mocks.viewer }));
vi.mock("@/components/movers-refresh", () => ({ MoversRefresh: () => null }));
vi.mock("@/components/public-nav", () => ({
  PublicNav: ({ authenticated }: { authenticated?: boolean }) => createElement(
    "header", { className: "topbar" },
    createElement("div", { className: "shell topbar-inner" },
      createElement("a", { className: "brand", href: "/", "aria-label": "oddsup home" },
        createElement("span", { className: "brand-mark", "aria-hidden": "true" }),
        createElement("span", { className: "brand-text" }, "oddsup")),
      createElement("nav", { className: "nav", "aria-label": "Public navigation" },
        createElement("a", { href: "/movers", "aria-current": "page" }, "Movers"),
        createElement("a", { href: "/markets" }, "Markets"),
        createElement("a", { href: authenticated ? "/alerts" : "/about" }, authenticated ? "Alerts" : "About"),
        createElement("a", { href: authenticated ? "/settings" : "/login" }, authenticated ? "Settings" : "Sign in"))),
  ),
}));

import MoversPage from "@/app/movers/page";
import MoversLoading from "@/app/movers/loading";

const movers = [
  { marketId: "34367", marketName: "Will xyz:SP500 be above $7,243 on November 24, 2026?", category: "Economics" as const, closesAt: "2026-11-25T00:00:00.000Z", currentProbability: 0.576, historicalProbability: 0.168, deltaPoints: 40.8, direction: "up" as const, currentObservedAt: "2026-11-24T15:42:18.000Z", historicalObservedAt: "2026-11-24T14:42:18.000Z" },
  { marketId: "34512", marketName: "Will the Los Angeles Lakers win their NBA matchup against the Golden State Warriors after overtime?", category: "Sports" as const, closesAt: "2026-11-25T04:00:00.000Z", currentProbability: 0.291, historicalProbability: 0.474, deltaPoints: -18.3, direction: "down" as const, currentObservedAt: "2026-11-24T15:42:18.000Z", historicalObservedAt: "2026-11-24T14:42:18.000Z" },
  { marketId: "34603", marketName: "Will the Buffalo Bills defeat the Houston Texans in the NFL regular-season game?", category: "Sports" as const, closesAt: "2026-11-26T02:00:00.000Z", currentProbability: 0.642, historicalProbability: 0.608, deltaPoints: 3.4, direction: "up" as const, currentObservedAt: "2026-11-24T15:42:18.000Z", historicalObservedAt: "2026-11-24T14:42:18.000Z" },
];

const output = process.env.MOVERS_FIXTURE_OUTPUT;
const document = (markup: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Movers visual fixture</title><link rel="stylesheet" href="/global.css"></head><body>${markup}</body></html>`;

async function renderFixture(state: string, windowName: "5m" | "1h" | "24h", authenticated = false) {
  mocks.viewer.mockResolvedValue(authenticated ? { id: "fixture-user", email: "fixture@example.test", preview: false } : null);
  mocks.snapshot.mockResolvedValue({
    state,
    movers: state === "live" || state === "updating" || state === "last-known" ? movers.map((mover) => ({ ...mover, window: windowName })) : [],
    window: windowName,
    fetchedAt: state === "upstream-error" || state === "unavailable" ? null : "2026-11-24T15:42:18.000Z",
    eligibleMarketCount: 267,
    insufficientHistoryCount: state === "collecting" ? 267 : 19,
  });
  return document(renderToStaticMarkup(await MoversPage({ searchParams: Promise.resolve({ window: windowName }) })));
}

beforeAll(async () => {
  if (output) await mkdir(output, { recursive: true });
});

const visualFixtureTest = output ? it : it.skip;

visualFixtureTest("writes deterministic Movers visual fixtures", async () => {
  for (const windowName of ["5m", "1h", "24h"] as const) {
    await writeFile(path.join(output!, `live-${windowName}-anonymous.html`), await renderFixture("live", windowName));
  }
  await writeFile(path.join(output!, "live-1h-authenticated.html"), await renderFixture("live", "1h", true));
  for (const state of ["updating", "last-known", "collecting", "stale", "upstream-error", "unavailable", "empty"]) {
    await writeFile(path.join(output!, `${state}-1h-anonymous.html`), await renderFixture(state, "1h"));
  }
  await writeFile(path.join(output!, "loading-1h-anonymous.html"), document(renderToStaticMarkup(createElement(MoversLoading))));
  expect(mocks.snapshot).toHaveBeenCalled();
});
