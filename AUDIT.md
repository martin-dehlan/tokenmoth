# tokenrat — Architecture Audit

This document records the technical audit performed before implementation, and the
design corrections that followed. Read it before changing the hook/CLI/ingestion path.

## Finding 1 — Claude Code hooks do NOT carry token counts 🔴

The original plan assumed the `SessionEnd`/`Stop` hook JSON payload contains
`input_tokens`, `output_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`. **It does not.**

Real payloads:

```jsonc
// Stop
{ "session_id": "...", "transcript_path": "...", "cwd": "...",
  "hook_event_name": "Stop", "stop_hook_active": false }

// SessionEnd
{ "session_id": "...", "transcript_path": "...", "cwd": "...",
  "hook_event_name": "SessionEnd", "reason": "exit" }
```

Token usage lives in the **transcript JSONL** at `transcript_path`. Each assistant
message has a `message.usage` object with the four counts.

**Correction:** `tokenrat report` reads `transcript_path`, sums `usage` across
messages, then POSTs the aggregate. The hook payload is *not* forwarded verbatim.

## Finding 2 — "Zero latency guaranteed" is false 🔴

- `SessionEnd` fires at shutdown — it is **not** in the interactive typing loop, so
  "latency during active typing" is a category error there.
- `Stop` fires after **every** assistant turn. Claude Code **waits** for hooks
  (default 60s timeout), so a synchronous `Stop` hook *can* add per-turn latency.
- Nothing "guarantees absolutely zero."

**Correction:** track on `SessionEnd` (once per session). `report` uses a short (5s)
HTTP timeout and swallows all errors so a slow/failed network call never surfaces to
the user. For a stricter no-block guarantee, wire it detached.

## Finding 3 — API key in query string leaks 🟠

Keys in `?key=` land in access logs, proxies and `ps` output.
**Correction:** auth via `Authorization: Bearer <key>`. Repo name travels in the body.

## Finding 4 — One global hook can't hardcode one repo 🟠

A hook installed once in `~/.claude/settings.json` runs across all projects, so it
cannot bake in a single repo name. **Correction:** `report` derives the repo at
runtime from `cwd` (`git -C <cwd> rev-parse --show-toplevel` → basename).

## Finding 5 — Idempotency 🟠

`SessionEnd` can fire on `clear`/`logout`/`exit`. **Correction:** `token_logs` has
`UNIQUE(session_id)` and the API upserts, so re-fires update instead of double-billing.

## Finding 6 — Stack verdict 🟢

- **Rust / Axum / Tokio / SQLx / Postgres** ingestion: approved (cheap, predictable
  high-throughput inserts).
- **Next.js + Tailwind** over **Leptos/WASM**: approved — mature neo-brutalist/chart
  component ecosystem, no WASM bundle weight, fast styling iteration. Leptos perf is
  fine but the dashboard tooling around it is thin.
- **Hosting:** not Vercel (project preference). Target Fly.io / Railway / self-host.
