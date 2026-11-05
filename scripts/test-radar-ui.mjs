// Local-only browser validation. Uses the real Radar page, forms, actions and CSS
// with explicitly synthetic auth/storage adapters; NOT hosted Auth/RLS validation.
// Requires existing Playwright and Chromium, never installs anything.
// node scripts/test-radar-ui.mjs <playwright package directory> [browser executable]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(path.resolve(process.argv[2] ?? "node_modules/playwright"));
const esbuildDir = (await readdir(path.join(root, "node_modules/.pnpm"))).find((p) => p.startsWith("esbuild@"));
const { build } = require(path.join(root, "node_modules/.pnpm", esbuildDir, "node_modules/esbuild"));
const output = await mkdtemp(path.join(tmpdir(), "oddsup-radar-ui-"));
const cssFiles = (await readdir(path.join(root, ".next/static/chunks"))).filter((p) => p.endsWith(".css"));
const css = (await Promise.all(cssFiles.map((p) => readFile(path.join(root, ".next/static/chunks", p), "utf8")))).join("\n");
const fixture = `
export const markets = [
 {id:"101",name:"Will Los Angeles Lakers beat Golden State Warriors in the championship deciding game?",searchTerms:["NBA"],yesCoin:"#1010",noCoin:"#1011",yesPrice:.55,noPrice:.45},
 {id:"102",name:"Will Arizona Cardinals vs New York Giants go over 43.5 total points?",searchTerms:["USA National Football League (NFL)"],yesCoin:"#1020",noCoin:"#1021",yesPrice:.4,noPrice:.6}
];
export const state = {rows:[], storageError:false, rpcError:false, stale:false, delay:500};
export const viewer = {id:"11111111-1111-4111-8111-111111111111",preview:false};
export const getViewer = async()=>viewer;
export const getAuthContext = async()=>({viewer,profile:{telegram_chat_id:null}});
export const getMarketsWithFallback = async()=>({markets,source:state.stale?"stale":"live",fetchedAt:new Date().toISOString()});
export const createClient = async()=>({
 from:()=>({select:()=>({eq:()=>({order:()=>({limit:async()=>({data:state.storageError?null:[...state.rows],error:state.storageError?{}:null})})})})}),
 rpc:async(name,p)=>{
  await new Promise(r=>setTimeout(r,state.delay));
  if(state.rpcError) return {data:null,error:{}};
  if(name==="create_radar_subscription"){
   if(state.rows.some(r=>r.target===p.p_target&&r.window_name===p.p_window)) return {data:null,error:{}};
   state.rows.push({id:crypto.randomUUID(),target_kind:p.p_kind,target:p.p_target,window_name:p.p_window,threshold_points:p.p_threshold,generation:1,paused:false});
  } else {
   const row=state.rows.find(r=>r.id===p.p_id);
   if(!row) return {data:false,error:null};
   if(p.p_operation==="remove") state.rows=state.rows.filter(r=>r!==row);
   else {row.paused=p.p_operation==="pause";row.generation++;}
  }
  return {data:true,error:null};
 }
});
export const revalidatePath=()=>setTimeout(()=>window.renderRadarFixture(),0);
`;
await build({
  stdin: {
    contents: `
      import React from "react";
      import {createRoot} from "react-dom/client";
      import RadarPage from "@/app/(app)/radar/page";
      import {AppNav} from "@/components/app-nav";
      import {state} from "radar-fixture";
      const root=createRoot(document.getElementById("root"));
      window.radarFixture=state;
      window.renderRadarFixture=async()=>root.render(React.createElement(React.Fragment,null,React.createElement(AppNav),await RadarPage()));
      window.renderRadarFixture();
    `,
    resolveDir: root, loader: "tsx",
  },
  absWorkingDir: root, bundle: true, outfile: path.join(output, "fixture.js"),
  jsx: "automatic", minify: true, define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": root }, loader: { ".css": "local-css" },
  plugins: [{
    name: "synthetic-local-adapters",
    setup(b) {
      b.onResolve({ filter: /^(radar-fixture|@\/lib\/auth|@\/lib\/supabase\/server|@\/lib\/hyperliquid\/client|next\/cache)$/ }, () => ({ path: "fixture", namespace: "synthetic" }));
      b.onResolve({ filter: /^next\/(link|navigation)$/ }, (args) => ({ path: args.path, namespace: "synthetic" }));
      b.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path: p }) => ({
        contents: p === "fixture" ? fixture : p === "next/link"
          ? 'import React from "react";export default function Link(p){return React.createElement("a",p)}'
          : 'export const usePathname=()=>"/radar";export const redirect=()=>{throw new Error("fixture redirect")};',
        loader: "js", resolveDir: root,
      }));
    },
  }],
});

// This server also supplies synthetic public market data to the local Next build.
const fixtureServer = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/info") {
    let body = ""; for await (const part of req) body += part;
    const type = JSON.parse(body).type;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(type === "allMids" ? { "#1010": ".55", "#1011": ".45", "#1020": ".4", "#1021": ".6" } : {
      outcomes: [
        { outcome: 101, name: "Will Los Angeles Lakers beat Golden State Warriors?", description: "league:NBA|sport:basketball" },
        { outcome: 102, name: "Will Arizona Cardinals beat New York Giants?", description: "league:NFL|sport:football" },
      ],
    })); return;
  }
  if (url.pathname === "/global.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
  if (["/fixture.js", "/fixture.css"].includes(url.pathname)) {
    res.setHeader("Content-Type", url.pathname.endsWith(".js") ? "text/javascript" : "text/css");
    res.end(await readFile(path.join(output, url.pathname.slice(1)))); return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic Radar UI test</title><link rel="stylesheet" href="/global.css"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise((r) => fixtureServer.listen(0, "127.0.0.1", r));
const fixtureOrigin = `http://127.0.0.1:${fixtureServer.address().port}`;
const nextPort = 3229;
const nextOrigin = `http://127.0.0.1:${nextPort}`;
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SUPABASE_SERVICE_ROLE_KEY: "", TELEGRAM_BOT_TOKEN: "", RADAR_NOTIFICATIONS_ENABLED: "false",
  HYPERLIQUID_API_URL: fixtureOrigin, NEXT_TELEMETRY_DISABLED: "1" };
const next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(nextPort)], {
  cwd: root, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
});
let browser;
const results = [];
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local build startup timeout")), 30_000);
    next.stdout.on("data", (s) => { if (String(s).includes("Ready")) { clearTimeout(timer); resolve(); } });
    next.on("error", reject);
    next.on("exit", (code) => { if (code) { clearTimeout(timer); reject(new Error("Local build failed to start")); } });
  });
  browser = await chromium.launch({ headless: true, ...(process.argv[3] ? { executablePath: process.argv[3] } : {}) });
  for (const width of [375, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: width < 1000 });
    // No browser requests to production, external services, or account sessions.
    await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const checkLayout = async (stage) => {
      const dimensions = await page.evaluate(() => ({
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        clipped: [...document.querySelectorAll("main button,main select,main input,main article")].filter((e) => {
          const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        }).length,
      }));
      assert.equal(dimensions.width, width, `${stage}: actual viewport`);
      assert.ok(dimensions.scroll <= width, `${stage}: horizontal overflow ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.clipped, 0, `${stage}: clipped controls`);
      return dimensions;
    };
    await page.goto(fixtureOrigin);
    await page.getByText("No follows yet.", { exact: true }).waitFor();
    await checkLayout("empty");
    const fill = async (kind, target, windowName) => {
      await page.getByRole("combobox", { name: "Follow type", exact: true }).selectOption(kind);
      await page.getByRole("combobox", { name: kind === "market" ? "Market" : "League", exact: true }).selectOption(target);
      await page.getByRole("spinbutton").fill("5.5");
      await page.getByRole("combobox", { name: "Comparison window" }).selectOption(windowName);
      await page.getByRole("checkbox").check();
    };
    const save = page.getByRole("button", { name: "Save follow", exact: true });
    await fill("market", "101", "5m");
    await page.getByRole("spinbutton").fill("0");
    assert.equal(await page.getByRole("spinbutton").evaluate((e) => e.validity.valid), false);
    await page.getByRole("spinbutton").fill("5.5");
    await save.click();
    await page.waitForFunction(() => document.querySelector("button.btn-primary")?.disabled);
    await page.getByText(/^Follow saved/).waitFor();
    await page.locator("article").waitFor();
    await checkLayout("created");
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.radarFixture.rows[0].generation), 3);
    await fill("category", "NBA", "1h"); await save.click();
    await page.getByRole("heading", { name: "NBA markets", exact: true }).waitFor();
    await fill("category", "NFL", "24h"); await save.click();
    await page.getByRole("heading", { name: "NFL markets", exact: true }).waitFor();
    await checkLayout("populated");
    const touch = await page.locator("main button,main select,main input[type=number],main label:has(input[type=checkbox])").evaluateAll((nodes) => nodes.map((e) => ({
      text: (e.textContent || e.getAttribute("name") || "").slice(0, 30), height: e.getBoundingClientRect().height,
    })));
    assert.ok(touch.every((t) => t.height >= 44), `Touch targets under 44px: ${JSON.stringify(touch.filter((t) => t.height < 44))}`);
    await page.screenshot({ path: path.join(output, `radar-${width}.png`), fullPage: true });
    await page.evaluate(() => { window.radarFixture.rpcError = true; });
    await page.getByRole("button", { name: "Pause", exact: true }).first().click();
    await page.getByText(/^Could not change this subscription/).waitFor();
    await fill("category", "NBA", "5m"); await save.click();
    await page.getByText(/^Could not save/).waitFor();
    await checkLayout("errors");
    await page.evaluate(() => { window.radarFixture.rpcError = false; });
    while (await page.locator("article").count()) {
      const count = await page.locator("article").count();
      await page.getByRole("button", { name: "Remove", exact: true }).first().click();
      await page.waitForFunction((n) => document.querySelectorAll("article").length < n, count);
    }
    await page.getByText("No follows yet.", { exact: true }).waitFor();
    await page.evaluate(async () => { window.radarFixture.storageError = true; await window.renderRadarFixture(); });
    await page.getByText("Radar storage is unavailable. Existing alerts are unaffected.", { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await page.evaluate(async () => { window.radarFixture.storageError = false; window.radarFixture.stale = true; await window.renderRadarFixture(); });
    await page.getByText("Market data is updating. New follows are temporarily unavailable.", { exact: true }).waitFor();
    assert.equal(await save.isDisabled(), true);
    await checkLayout("unavailable");
    assert.deepEqual(errors, []);
    // Separately inspect real Next production routes, in unauthenticated local preview.
    const routes = [];
    const productionRoutes = ["/radar", "/markets"];
    await page.goto(nextOrigin + "/markets");
    const marketHref = await page.locator('a[href^="/markets/"]').first().getAttribute("href");
    assert.ok(marketHref, "local production market detail link");
    productionRoutes.push(marketHref, "/alerts", "/settings", "/movers", "/login", "/", "/about");
    for (const route of productionRoutes) {
      const response = await page.goto(nextOrigin + route);
      assert.equal(response.status(), 200, route);
      await page.locator("h1").waitFor();
      const size = await checkLayout(`production ${route}`);
      routes.push({ route, status: response.status(), ...size });
    }
    results.push({ width, synthetic: "CRUD, NBA/NFL, all windows, pending, errors, unavailable, touch targets passed", routes });
    console.log(`PASS viewport ${width}: synthetic interaction and local production route checks`);
    await context.close();
  }
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ result: "PASS", output, results }));
} finally {
  await browser?.close();
  next.kill();
  await new Promise((r) => fixtureServer.close(r));
}
