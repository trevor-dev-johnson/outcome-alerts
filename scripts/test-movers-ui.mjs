// Local-only browser validation for deterministic Movers fixtures.
// node scripts/test-movers-ui.mjs <playwright-core directory> <browser executable> <output directory>
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const require = createRequire(import.meta.url);
const playwrightPath = process.argv[2];
const browserExecutable = process.argv[3];
const screenshots = path.resolve(process.argv[4] ?? path.join(root, ".movers-screenshots"));
const keepOpen = process.argv.includes("--serve");
if (!playwrightPath || !browserExecutable) throw new Error("Pass Playwright Core and browser paths");

const fixtureOutput = await mkdtemp(path.join(tmpdir(), "oddsup-movers-fixtures-"));
const render = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "scripts/render-movers-fixtures.test.ts"], {
  cwd: root,
  env: { ...process.env, MOVERS_FIXTURE_OUTPUT: fixtureOutput },
  encoding: "utf8",
});
if (render.status !== 0) throw new Error(`${render.stdout}\n${render.stderr}`);

const cssFiles = (await readdir(path.join(root, ".next/static/chunks"))).filter((entry) => entry.endsWith(".css"));
const css = (await Promise.all(cssFiles.map((entry) => readFile(path.join(root, ".next/static/chunks", entry), "utf8")))).join("\n");
const fileForRequest = (url) => {
  const state = url.searchParams.get("state") || "live";
  const windowName = url.searchParams.get("window") || "1h";
  const auth = url.searchParams.get("auth") === "1" ? "authenticated" : "anonymous";
  return state === "live" ? `live-${windowName}-${auth}.html` : `${state}-1h-anonymous.html`;
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/global.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(css);
    return;
  }
  response.setHeader("Content-Type", "text/html");
  response.end(await readFile(path.join(fixtureOutput, fileForRequest(url)), "utf8"));
});

const portArgument = process.argv.find((argument) => argument.startsWith("--port="));
const reviewPort = Number.parseInt(portArgument?.slice("--port=".length) ?? process.env.MOVERS_REVIEW_PORT ?? "0", 10);
if (!Number.isFinite(reviewPort) || reviewPort < 0 || reviewPort > 65535) throw new Error("MOVERS_REVIEW_PORT must be a valid port");
await new Promise((resolve) => server.listen(reviewPort, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(screenshots, { recursive: true });
const { chromium } = require(path.resolve(playwrightPath));
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable });
const results = [];

try {
  const viewports = [
    { width: 320, height: 720 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 900 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, colorScheme: "dark", hasTouch: viewport.width < 1024, isMobile: viewport.width < 768 });
    await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${origin}/movers?window=1h&state=live`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Movers", exact: true }).waitFor();
    const measurements = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      cards: document.querySelectorAll("article").length,
      smallTargets: [...document.querySelectorAll("main a, main button")]
        .map((element) => ({ label: element.textContent?.trim(), height: element.getBoundingClientRect().height }))
        .filter((target) => target.height > 0 && target.height < 44),
    }));
    assert.equal(measurements.viewportWidth, viewport.width);
    assert.ok(measurements.scrollWidth <= viewport.width, `Horizontal overflow at ${viewport.width}: ${JSON.stringify(measurements)}`);
    assert.equal(measurements.cards, 3);
    const screenshot = path.join(screenshots, `movers-live-${viewport.width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results.push({ ...viewport, screenshot, measurements });
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  for (const windowName of ["5m", "1h", "24h"]) {
    await page.goto(`${origin}/movers?window=${windowName}&state=live`, { waitUntil: "networkidle" });
    assert.equal(await page.locator('[aria-current="page"]').filter({ hasText: windowName }).count(), 1);
  }
  for (const state of ["loading", "updating", "last-known", "collecting", "stale", "upstream-error", "unavailable", "empty"]) {
    await page.goto(`${origin}/movers?window=1h&state=${state}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshots, `movers-${state}-390.png`), fullPage: true });
    assert.equal(await page.getByText("Set alert", { exact: true }).count(), 0);
  }
  await page.goto(`${origin}/movers?window=1h&state=live`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("link", { name: /^Set alert for/ }).first().getAttribute("href"), "/login?next=%2Fmarkets%2F34367%23alert-configuration");
  await page.goto(`${origin}/movers?window=1h&state=live&auth=1`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("link", { name: /^Set alert for/ }).first().getAttribute("href"), "/markets/34367#alert-configuration");
  await context.close();
  await writeFile(path.join(screenshots, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ result: "PASS", origin, screenshots, results }, null, 2));
  if (keepOpen) {
    console.log(`MOVERS_REVIEW_URL=${origin}/movers?window=1h&state=live`);
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
