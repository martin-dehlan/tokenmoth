// Records the tokenmoth product tour to a webm using Playwright + Chromium.
//
//   node scripts/record-demo.mjs
//
// Drives the demo-data dashboard (run this on the `demo/recording` branch,
// where the auth gate is bypassed and every page renders in-code fixtures).
// If a dev server is already serving DEMO_BASE_URL it is reused; otherwise the
// script boots `next dev` in frontend/ and shuts it down when done.
//
// Output: recordings/demo.webm  (feed it to scripts/encode-demo.sh)
//
// Timing is deterministic (fixed pauses + eased scrolls) so repeated runs
// produce near-identical clips. Tune SECTION_PAUSE / SCROLL_MS for length.

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(REPO_ROOT, "frontend");
const OUT_DIR = path.join(REPO_ROOT, "recordings");
const VIDEO_DIR = path.join(OUT_DIR, ".pw"); // playwright writes a random name here
const OUT_WEBM = path.join(OUT_DIR, "demo.webm");

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;

// Pacing knobs (ms). Tuned so the full tour lands at ~22s — short enough for a
// reasonable GIF, long enough to read each panel.
const SETTLE = 500; // after each navigation, let it paint
const SECTION_PAUSE = 650; // hold on each scrolled section
const SCROLL_MS = 850; // eased scroll duration

// playwright lives in frontend/node_modules (installed there per #197).
const require = createRequire(path.join(FRONTEND, "package.json"));
const { chromium } = require("playwright");

// ---- dev server lifecycle --------------------------------------------------

async function isUp(url) {
  try {
    const r = await fetch(url, { method: "GET" });
    return r.ok || r.status === 200;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isUp(BASE_URL)) {
    console.log(`[record] reusing dev server at ${BASE_URL}`);
    return null; // not ours — don't kill it
  }
  console.log("[record] starting `next dev` ...");
  const child = spawn("npm", ["run", "dev"], {
    cwd: FRONTEND,
    shell: true,
    stdio: "ignore",
    env: {
      ...process.env,
      TOKENMOTH_API_URL: "http://127.0.0.1:9",
      NEXT_PUBLIC_DEMO_MOTION: "full", // raise motion intensity for the camera (#207)
    },
  });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await isUp(BASE_URL)) {
      console.log("[record] dev server ready");
      return child;
    }
    await sleep(1000);
  }
  throw new Error("dev server did not become ready within 90s");
}

function stopServer(child) {
  if (!child) return;
  try {
    // next dev spawns a child worker — kill the whole tree on Windows.
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`);
    else process.kill(-child.pid);
  } catch {
    /* already gone */
  }
}

// ---- page choreography -----------------------------------------------------

// Eased scroll to an absolute Y, animated in the page so the video captures it.
// Duration scales with distance (constant, gentle velocity) so every scroll
// moves only a few px per recorded frame — no jerky stepping on long jumps.
async function easeScrollTo(page, y, msOverride) {
  await page.evaluate(
    ({ y, msOverride }) =>
      new Promise((res) => {
        const start = window.scrollY;
        const dist = y - start;
        // ~3.2ms/px → ~12px per 25fps frame; clamped so tiny/huge jumps stay sane.
        const ms = msOverride ?? Math.min(2600, Math.max(700, Math.abs(dist) * 3.2));
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          const e = -(Math.cos(Math.PI * p) - 1) / 2; // easeInOutSine — gentle both ends
          window.scrollTo(0, start + dist * e);
          if (p < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    { y, msOverride },
  );
}

// One slow, continuous pan from the current position to the bottom of the page
// — a single smooth move per page instead of many small scroll hops.
async function panToBottom(page) {
  const { target, start } = await page.evaluate(() => ({
    target: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    start: window.scrollY,
  }));
  const dist = Math.abs(target - start);
  if (dist < 8) return;
  // Slow cinematic pace (~5ms/px → ~8px per 25fps frame), clamped.
  const ms = Math.min(5200, Math.max(1600, dist * 5));
  await easeScrollTo(page, target, ms);
}

// Slow pan so a selector sits `frac` down from the top, then the caller holds.
async function panToSelector(page, selector, frac = 0.3) {
  const y = await page.evaluate(
    ({ selector, frac }) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Math.max(0, window.scrollY + r.top - window.innerHeight * frac);
    },
    { selector, frac },
  );
  if (y === null) return;
  const start = await page.evaluate(() => window.scrollY);
  const ms = Math.min(5000, Math.max(1400, Math.abs(y - start) * 5));
  await easeScrollTo(page, y, ms);
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await sleep(SETTLE);
}

async function runTour(page) {
  // One slow pan down per page — no small hops.

  // 1) Dashboard — hold on the headline, then pan the whole panel.
  await goto(page, BASE_URL + "/");
  await page.waitForSelector("#hero", { timeout: 30_000 });
  await sleep(SECTION_PAUSE + 500);
  await panToBottom(page);
  await sleep(SECTION_PAUSE);

  // 2) Repo detail — pan to the session history, then fire the staged arrival
  // (once it's in view) and hold so the highlighted new row plays fully.
  await goto(page, BASE_URL + "/repo/aurora-api?demo=arrival");
  await page.waitForSelector("main", { timeout: 30_000 });
  await sleep(SECTION_PAUSE);
  await panToBottom(page);
  await sleep(700);
  await page.evaluate(() => window.dispatchEvent(new Event("tm-demo-arrival")));
  await sleep(3200);

  // 3) Drill into a session — the deep-analytics payoff. Give it room: hold the
  // hero, pan to the cost-anatomy / per-call growth chart and dwell so its bars
  // build up, then pan the rest (hook overhead + MCP servers).
  await goto(page, BASE_URL + "/session/demo-aurora-api-2");
  await page.waitForSelector("main", { timeout: 30_000 });
  await sleep(SECTION_PAUSE + 800);
  await panToSelector(page, "svg[aria-label='context size per API call']", 0.34);
  await sleep(2600);
  await panToBottom(page);
  await sleep(SECTION_PAUSE + 800);

  // 4) Close on "what leaves your machine" — the privacy/trust beat, last.
  await goto(page, BASE_URL + "/data");
  await sleep(SECTION_PAUSE);
  await panToBottom(page);
  await sleep(SECTION_PAUSE + 700);
}

// ---- main ------------------------------------------------------------------

async function main() {
  fs.rmSync(VIDEO_DIR, { recursive: true, force: true });
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
    colorScheme: "light",
  });
  const page = await context.newPage();

  let err;
  try {
    await runTour(page);
  } catch (e) {
    err = e;
  }

  const video = page.video();
  await context.close(); // flushes the webm to disk
  await browser.close();
  stopServer(server);

  if (err) throw err;

  const raw = await video.path();
  fs.rmSync(OUT_WEBM, { force: true });
  fs.copyFileSync(raw, OUT_WEBM);
  console.log(`[record] wrote ${path.relative(REPO_ROOT, OUT_WEBM)}`);
}

main().catch((e) => {
  console.error("[record] failed:", e);
  process.exit(1);
});
