#!/usr/bin/env node
// Thin launcher: exec the vendored native `tokenmoth` binary that postinstall
// downloaded, forwarding argv + stdio and propagating the exit code. Keeps the
// npm package cross-platform without a per-OS optional-dependency matrix.
"use strict";

const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const binName = process.platform === "win32" ? "tokenmoth.exe" : "tokenmoth";
const binPath = path.join(__dirname, "..", "vendor", binName);

if (!fs.existsSync(binPath)) {
  console.error(
    "tokenmoth: native binary not found — the postinstall download may have " +
      "failed. Reinstall with `npm install -g tokenmoth`, or install via " +
      "https://tokenmoth.com",
  );
  process.exit(1);
}

const res = spawnSync(binPath, process.argv.slice(2), { stdio: "inherit" });
if (res.error) {
  console.error(`tokenmoth: ${res.error.message}`);
  process.exit(1);
}
if (res.status === null && res.signal) {
  // Child died from a signal — re-raise it on ourselves so the caller sees the
  // same termination (exit code 128+N) instead of a generic exit 1.
  process.kill(process.pid, res.signal);
}
process.exit(res.status === null ? 1 : res.status);
