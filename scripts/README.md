# Demo recording (Milestone 10)

Produces the animated product-tour clip (MP4 master + GIF) used on the website,
README and social. See epic #194.

## Pipeline

```
demo/recording branch  ──►  record-demo.mjs  ──►  recordings/demo.webm
                                                        │
                                  encode-demo.sh ───────┘
                                       │
                                       ▼
                     docs/demo/tokenmoth-demo.mp4  +  .gif
```

1. **Be on the `demo/recording` branch.** It bypasses the auth gate and
   neutralizes `middleware.ts` so every tour page renders in-code demo
   fixtures (`frontend/lib/data.ts`) with no backend, DB or Supabase env.
   This branch is throwaway — never merge it.
2. **Record:** `node scripts/record-demo.mjs`
   Reuses a running dev server at `http://localhost:3000`, else boots
   `next dev` itself. Writes `recordings/demo.webm`.
3. **Encode:** `scripts/encode-demo.sh` (Git Bash on Windows).
   Writes `docs/demo/tokenmoth-demo.mp4` and `.gif`.

## Tooling / versions

| tool       | version            | install                                   |
|------------|--------------------|-------------------------------------------|
| node       | 22.x               | —                                         |
| playwright | 1.60.0 (devDep in `frontend/`) | `cd frontend && npm i -D playwright` |
| chromium   | headless-shell 148 | `cd frontend && npx playwright install chromium` |
| ffmpeg     | 8.1                | winget/brew — must be on `PATH`           |

## Tuning

- Pacing: `SECTION_PAUSE`, `SCROLL_MS`, `SETTLE` constants in `record-demo.mjs`.
- Viewport: desktop `1440×900 @2x` (constants `VIEWPORT` / `SCALE`).
- GIF size/quality: `GIF_FPS` (11) and `GIF_WIDTH` (760) env vars for
  `encode-demo.sh`, e.g. `GIF_FPS=12 GIF_WIDTH=900 scripts/encode-demo.sh`.
  Defaults keep the ~27s motion tour under GitHub's ~10MB inline-GIF cap
  (currently 9.5MB). Record on `demo/recording` with NEXT_PUBLIC_DEMO_MOTION=full
  (the script sets it) so bar grow-in, row arrival and page fades are captured.

`recordings/` is intermediate and git-ignored; only `docs/demo/` is committed.
The two scripts are reusable and meant to be kept on a clean branch — only the
auth-bypass + fixture edits stay quarantined on `demo/recording`.
