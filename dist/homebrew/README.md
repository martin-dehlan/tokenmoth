# Homebrew distribution

`tokenmoth.rb` here is the **source of truth** for the Homebrew formula. On each
release, `.github/workflows/release.yml` (job `homebrew`) renders the
`{{VERSION}}` / `{{SHA256_*}}` placeholders from the built artifacts and pushes
the result to the public tap repo, so users can:

```bash
brew install martin-dehlan/tokenmoth/tokenmoth
```

## One-time setup (manual, outside this repo)

1. **Create a public tap repo** named `homebrew-tokenmoth` under the
   `martin-dehlan` account. Homebrew requires the `homebrew-` prefix; the tap is
   then referenced as `martin-dehlan/tokenmoth`. It can be empty — CI creates
   `Formula/tokenmoth.rb` on the first release.
2. **Add a `HOMEBREW_TAP_TOKEN` secret** to *this* repo: a fine-grained PAT (or
   classic PAT with `repo` scope) that can push to `homebrew-tokenmoth`.
3. **Enable the job**: set the repo variable `PUBLISH_HOMEBREW=true`
   (Settings → Secrets and variables → Actions → Variables). The job is skipped
   unless this is set, so existing releases are unaffected until you opt in.

## Caveat — "latest" artifacts vs. pinned checksums

The dist bucket currently serves **unversioned** `tokenmoth-<target>.tar.gz`
(each release overwrites them). Homebrew pins a `sha256` per release, so a formula
built for vX keeps working only while the bucket still holds vX's bytes. Once a
later release overwrites them, `brew install` of the *old* formula would checksum-
fail. This is fine as long as the tap always tracks the latest release (it does —
CI pushes on every tag). If we later want multiple installable versions, switch
the bucket to versioned paths (`/cli-vX.Y.Z/tokenmoth-<target>.tar.gz`) — see
issue #126 “out of scope”.
