# tokenmoth

Track, aggregate and visualize **Claude Code** token usage & cost — per Git repo.
This is a thin npm wrapper around the prebuilt `tokenmoth` Rust binary: no Rust
toolchain, no compile. Its `postinstall` downloads the right binary for your
platform from the public distribution host.

```bash
# one-off, no install
npx tokenmoth setup --key <your-key>

# or install globally
npm install -g tokenmoth
tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com
```

Other install paths (curl / PowerShell / Homebrew) and full docs:
<https://github.com/martin-dehlan/tokenmoth#install>

### How it picks a binary

`postinstall` maps `process.platform`/`process.arch` to a Rust target triple and
fetches `tokenmoth-<target>.tar.gz` from `TOKENMOTH_DIST_BASE`
(default `https://get.tokenmoth.com`, with the S3 bucket as fallback). Supported:
macOS (arm64/x64), Linux (arm64/x64), Windows (x64).

Env overrides: `TOKENMOTH_DIST_BASE` (source host), `TOKENMOTH_SKIP_DOWNLOAD=1`
(skip the fetch, e.g. in CI). Extraction uses the system `tar` (present on macOS,
Linux, and Windows 10+).
