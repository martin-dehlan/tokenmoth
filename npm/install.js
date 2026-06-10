// postinstall: download the prebuilt `tokenmoth` binary for this platform and
// drop it into vendor/. Zero runtime deps — uses node https + the system `tar`
// (present on macOS, Linux, and Windows 10+). The repo stays private; only the
// public release artifacts are fetched.
//
// Override the source with TOKENMOTH_DIST_BASE (e.g. point at the raw S3 URL).
// Skip the download entirely with TOKENMOTH_SKIP_DOWNLOAD=1 (CI / offline).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

// Branded dist domain (CloudFront → S3, see issue #124). Raw S3 stays as a
// transitional fallback if the branded host can't be reached.
const PRIMARY_BASE =
  process.env.TOKENMOTH_DIST_BASE || "https://get.tokenmoth.com";
const FALLBACK_BASE = "https://tokenmoth-dist.s3.eu-central-1.amazonaws.com";

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
      "  https://github.com/martin-dehlan/tokenmoth#install",
  );
  process.exit(1);
}

// GET with redirect following (CloudFront/S3 may 30x). Resolves to a Buffer.
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

async function fetchTarball(target) {
  const name = `tokenmoth-${target}.tar.gz`;
  for (const base of [PRIMARY_BASE, FALLBACK_BASE]) {
    const url = `${base}/${name}`;
    try {
      process.stdout.write(`→ downloading ${name} from ${base}…\n`);
      return await download(url);
    } catch (err) {
      process.stderr.write(`  ${base} failed: ${err.message}\n`);
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
