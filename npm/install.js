// postinstall: download the prebuilt `tokenmoth` binary for this platform and
// drop it into vendor/. Zero runtime deps — uses node https + the system `tar`
// (present on macOS, Linux, and Windows 10+). Artifacts come from the public
// GitHub Release matching this package's version (tag cli-v<version>).
//
// Override the source with TOKENMOTH_DIST_BASE: a base URL serving
// <base>/<artifact> and <base>/<artifact>.sha256 (e.g. a self-hosted mirror).
// Skip the download entirely with TOKENMOTH_SKIP_DOWNLOAD=1 (CI / offline).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const PKG_VERSION = require("./package.json").version;

const RELEASES = "https://github.com/martin-dehlan/tokenmoth/releases";

// Ordered download sources. The release pinned to this package's version comes
// first; "latest" is a fallback for a version whose release is missing.
function sources() {
  if (process.env.TOKENMOTH_DIST_BASE) {
    return [{ base: process.env.TOKENMOTH_DIST_BASE.replace(/\/+$/, ""), pinned: false }];
  }
  return [
    { base: `${RELEASES}/download/cli-v${PKG_VERSION}`, pinned: true },
    { base: `${RELEASES}/latest/download`, pinned: false },
  ];
}

// node platform/arch → Rust target triple (matches release.yml artifact names).
const TARGETS = {
  "darwin:arm64": "aarch64-apple-darwin",
  "darwin:x64": "x86_64-apple-darwin",
  "linux:x64": "x86_64-unknown-linux-gnu",
  "linux:arm64": "aarch64-unknown-linux-gnu",
  // No native win-arm64 build yet — x64 runs under emulation.
  "win32:x64": "x86_64-pc-windows-msvc",
  "win32:arm64": "x86_64-pc-windows-msvc",
};

function fail(msg) {
  console.error(`tokenmoth: ${msg}`);
  console.error(
    "  install the binary manually instead:\n" +
      "  https://tokenmoth.com",
  );
  process.exit(1);
}

// GET with redirect following (GitHub release assets 302 to a CDN). Resolves to a Buffer.
function download(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("too many redirects"));
    https
      .get(url, (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          res.resume();
          const next = new URL(headers.location, url).toString();
          return resolve(download(next, redirects + 1));
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

// Verify `buf` against the published .sha256 sidecar (`<hex>` — release.yml
// strips the filename via awk; tolerate `<hex>  <filename>` too). A mismatch
// is a hard failure: it means the artifact was corrupted or tampered with.
function verifyChecksum(buf, sidecar, name) {
  const expected = sidecar.toString("utf8").trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new Error(`malformed .sha256 sidecar for ${name}`);
  }
  const actual = crypto.createHash("sha256").update(buf).digest("hex");
  if (actual !== expected) {
    fail(
      `SHA-256 MISMATCH for ${name}!\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        "  The download is corrupted or has been tampered with. Refusing to install.",
    );
  }
}

async function fetchTarball(target) {
  const name = `tokenmoth-${target}.tar.gz`;
  for (const { base, pinned } of sources()) {
    const url = `${base}/${name}`;
    try {
      process.stdout.write(`→ downloading ${name} from ${base}…\n`);
      const tarball = await download(url);
      const sidecar = await download(`${url}.sha256`);
      verifyChecksum(tarball, sidecar, name);
      process.stdout.write("  ✓ sha256 verified\n");
      return tarball;
    } catch (err) {
      process.stderr.write(`  ${url} failed: ${err.message}\n`);
      if (pinned) {
        process.stderr.write(
          `tokenmoth: WARNING — release cli-v${PKG_VERSION} not available; ` +
            "falling back to the latest release (may not match this package version).\n",
        );
      }
    }
  }
  fail(`could not download ${name} from any source`);
}

async function main() {
  if (process.env.TOKENMOTH_SKIP_DOWNLOAD === "1") {
    process.stdout.write("tokenmoth: TOKENMOTH_SKIP_DOWNLOAD=1 — skipping.\n");
    return;
  }

  const key = `${process.platform}:${process.arch}`;
  const target = TARGETS[key];
  if (!target) fail(`unsupported platform ${key}`);

  const isWin = process.platform === "win32";
  const binName = isWin ? "tokenmoth.exe" : "tokenmoth";
  const vendorDir = path.join(__dirname, "vendor");
  const binPath = path.join(vendorDir, binName);

  fs.mkdirSync(vendorDir, { recursive: true });

  const tarball = await fetchTarball(target);
  const tmpTar = path.join(os.tmpdir(), `tokenmoth-${process.pid}.tar.gz`);
  fs.writeFileSync(tmpTar, tarball);
  try {
    // bsdtar/GNU tar both accept -xzf; available on win10+, macOS, Linux.
    execFileSync("tar", ["-xzf", tmpTar, "-C", vendorDir], {
      stdio: "inherit",
    });
  } catch (err) {
    fail(`extracting tarball failed: ${err.message}`);
  } finally {
    fs.rmSync(tmpTar, { force: true });
  }

  if (!fs.existsSync(binPath)) fail("binary missing after extraction");
  if (!isWin) fs.chmodSync(binPath, 0o755);

  process.stdout.write(`✓ tokenmoth installed → ${binPath}\n`);
}

main().catch((err) => fail(err.message));
