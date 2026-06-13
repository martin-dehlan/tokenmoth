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
    env: { ...process.env, TOKENMOTH_API_URL: "http://127.0.0.1:9" },
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
async function easeScrollTo(page, y, ms = SCROLL_MS) {
  await page.evaluate(
    ({ y, ms }) =>
      new Promise((res) => {
        const start = window.scrollY;
        const dist = y - start;
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
          window.scrollTo(0, start + dist * e);
          if (p < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    { y, ms },
  );
}

// Scroll a selector to ~1/4 from the top, then hold.
async function revealSection(page, selector, pause = SECTION_PAUSE) {
  const y = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return Math.max(0, window.scrollY + r.top - window.innerHeight * 0.22);
  }, selector);
  if (y === null) return false;
  await easeScrollTo(page, y);
  await sleep(pause);
  return true;
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await sleep(SETTLE);
}

async function runTour(page) {
  // 1) Dashboard — the headline number, then a tour down the panel.
  await goto(page, BASE_URL + "/");
  await page.waitForSelector("#hero", { timeout: 30_000 });
  await sleep(SECTION_PAUSE);
  for (const sel of ["section:has(h2)", "#instruments", "#instruments + section"]) {
    await revealSection(page, sel).catch(() => {});
  }
  // Scroll back to top to frame the next transition.
  await easeScrollTo(page, 0);
  await sleep(300);

  // 2) Privacy / "what leaves your machine" — trust beat.
  await goto(page, BASE_URL + "/data");
  await revealSection(page, "table");

  // 3) Repo detail — chart + breakdown + session history.
  await goto(page, BASE_URL + "/repo/cybermusic");
  await page.waitForSelector("main", { timeout: 30_000 });
  await sleep(SECTION_PAUSE);
  for (const sel of ["h2", "section:last-of-type"]) {
    await revealSection(page, sel).catch(() => {});
  }

  // 4) Drill into a session — the cost-anatomy payoff.
  await goto(page, BASE_URL + "/session/demo-cybermusic-2");
  await page.waitForSelector("main", { timeout: 30_000 });
  await sleep(SECTION_PAUSE);
  for (const sel of ["h2", "section:last-of-type"]) {
    await revealSection(page, sel).catch(() => {});
  }

  // 5) Land back on the headline number for the outro.
  await goto(page, BASE_URL + "/");
  await page.waitForSelector("#hero");
  await sleep(SECTION_PAUSE + 300);
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
