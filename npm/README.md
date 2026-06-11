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

### Import past sessions (backfill)

Already used Claude Code before installing? Pull your history in (idempotent —
safe to re-run, and totals add up across machines without double-counting):

```bash
tokenmoth backfill --key <your-key> --api-url https://api.tokenmoth.com
# --repo <name> to import a single repo · --dry-run to preview · --since <date>
```

### Claude Desktop (MCP server)

Track **Claude Desktop** sessions too by adding tokenmoth as an MCP server in
`claude_desktop_config.json`. It exposes a `report_session` tool that forwards
usage to the same endpoint, tagged `source=desktop_mcp` (Desktop sessions show a
`desktop` badge in the dashboard; Claude Code hook sessions are unaffected):

```jsonc
{
  "mcpServers": {
    "tokenmoth": {
      "command": "tokenmoth",
      "args": ["mcp", "--key", "<your-key>", "--api-url", "https://api.tokenmoth.com"]
    }
  }
}
```

### How it picks a binary

`postinstall` maps `process.platform`/`process.arch` to a Rust target triple and
fetches `tokenmoth-<target>.tar.gz` from `TOKENMOTH_DIST_BASE`
(default `https://get.tokenmoth.com`, with the S3 bucket as fallback). Supported:
macOS (arm64/x64), Linux (arm64/x64), Windows (x64).

Env overrides: `TOKENMOTH_DIST_BASE` (source host), `TOKENMOTH_SKIP_DOWNLOAD=1`
(skip the fetch, e.g. in CI). Extraction uses the system `tar` (present on macOS,
Linux, and Windows 10+).
