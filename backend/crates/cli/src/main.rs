//! tokenmoth-cli — installs the Claude Code hook and reports session token usage.
//!
//! Subcommands:
//!   * `tokenmoth setup --key tf_...`  — deep-merges a SessionEnd hook into
//!     ~/.claude/settings.json (or ./.claude with --local), preserving every
//!     existing setting. The installed hook runs `report --detach`.
//!   * `tokenmoth uninstall`           — removes only tokenmoth's hook entry.
//!   * `tokenmoth report --key tf_...` — invoked BY the hook. Reads the hook JSON
//!     from stdin, aggregates per-message `usage` from the session transcript
//!     (the hook payload itself carries no token counts — audit finding 1),
//!     derives the git repo name, and POSTs the aggregate. With `--detach` it
//!     re-spawns itself in the background and returns instantly so SessionEnd
//!     never blocks (audit finding 2).

use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEFAULT_API: &str = "https://api.tokenmoth.dev";

/// Hook events we register the reporter under:
///   * `Stop`       — after every assistant response → near-live per-turn updates.
///   * `SessionEnd` — once at close → guaranteed final flush (e.g. on /clear, exit).
/// Both run the same idempotent report (full-transcript sum + upsert), so firing
/// many times never double-counts.
const EVENTS: [&str; 2] = ["Stop", "SessionEnd"];

#[derive(Parser)]
#[command(name = "tokenmoth", version, about = "tokenmoth — Claude Code token & cost tracker")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Install the SessionEnd hook into Claude Code settings.
    Setup {
        #[arg(long)]
        key: String,
        #[arg(long, default_value = DEFAULT_API)]
        api_url: String,
        /// Install into ./.claude/settings.json instead of ~/.claude.
        #[arg(long)]
        local: bool,
    },
    /// Remove tokenmoth's SessionEnd hook (leaves all other settings untouched).
    Uninstall {
        #[arg(long)]
        local: bool,
    },
    /// Invoked by the Claude Code hook: parse transcript + POST usage. Never errors out the session.
    Report {
        #[arg(long)]
        key: String,
        #[arg(long, default_value = DEFAULT_API)]
        api_url: String,
        /// Re-spawn in the background and return immediately (used by the installed hook).
        #[arg(long)]
        detach: bool,
    },
    /// One-time: re-ingest every local transcript so historical sessions gain the
    /// plugin overhead breakdown. Idempotent (upserts by session id) and preserves
    /// each session's real end time. Safe to re-run.
    Backfill {
        #[arg(long)]
        key: String,
        #[arg(long, default_value = DEFAULT_API)]
        api_url: String,
        /// Parse + report what would be sent without POSTing.
        #[arg(long)]
        dry_run: bool,
        /// Only send sessions whose repo basename matches (privacy: exclude work repos).
        #[arg(long)]
        repo: Option<String>,
        /// Only send sessions ended on/after this date (e.g. 2026-01-01). ISO prefix compare.
        #[arg(long)]
        since: Option<String>,
        /// Skip the confirmation prompt.
        #[arg(long)]
        yes: bool,
        /// Ignore the saved cutoff and re-send the full history.
        #[arg(long)]
        full: bool,
    },
}

fn main() {
    let cli = Cli::parse();
    let r = match &cli.cmd {
        Cmd::Setup { key, api_url, local } => cmd_setup(key, api_url, *local),
        Cmd::Uninstall { local } => cmd_uninstall(*local),
        Cmd::Report { key, api_url, detach } => cmd_report(key, api_url, *detach),
        Cmd::Backfill { key, api_url, dry_run, repo, since, yes, full } => {
            cmd_backfill(key, api_url, *dry_run, repo.as_deref(), since.as_deref(), *yes, *full)
        }
    };
    if let Err(e) = r {
        // A hook must never break the user's session — log to stderr and exit 0.
        eprintln!("tokenmoth: {e}");
    }
}

fn settings_path(local: bool) -> anyhow::Result<PathBuf> {
    if local {
        Ok(PathBuf::from(".claude/settings.json"))
    } else {
        let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("could not resolve home dir"))?;
        Ok(home.join(".claude/settings.json"))
    }
}

fn load_settings(path: &PathBuf) -> anyhow::Result<Value> {
    if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(path)?)
            .map_err(|e| anyhow::anyhow!("{} is not valid JSON: {e}", path.display()))
    } else {
        Ok(json!({}))
    }
}

fn write_settings(path: &PathBuf, root: &Value) -> anyhow::Result<()> {
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(root)? + "\n")?;
    Ok(())
}

fn cmd_setup(key: &str, api_url: &str, local: bool) -> anyhow::Result<()> {
    let path = settings_path(local)?;
    let mut root = load_settings(&path)?;
    // Use this binary's absolute path so the hook resolves regardless of the
    // PATH the Claude Code hook runner sees. Falls back to a bare `tokenmoth`.
    let bin = std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(str::to_string))
        .unwrap_or_else(|| "tokenmoth".to_string());
    let command = format!("{bin} report --key {key} --api-url {api_url} --detach");

    if install_hook(&mut root, &command)? {
        println!("tokenmoth hooks already installed in {}", path.display());
        return Ok(());
    }
    write_settings(&path, &root)?;
    println!("✓ tokenmoth hooks installed ({}) → {}", EVENTS.join(" + "), path.display());
    println!("  Stop → live per-turn updates · SessionEnd → final flush. Repo auto-detected.");
    Ok(())
}

fn cmd_uninstall(local: bool) -> anyhow::Result<()> {
    let path = settings_path(local)?;
    if !path.exists() {
        println!("no settings file at {} — nothing to remove", path.display());
        return Ok(());
    }
    let mut root = load_settings(&path)?;
    let removed = uninstall_hook(&mut root);
    if removed == 0 {
        println!("no tokenmoth hook found in {}", path.display());
        return Ok(());
    }
    write_settings(&path, &root)?;
    println!("✓ removed tokenmoth hook from {}", path.display());
    Ok(())
}

/// Deep-merge the command hook under every event in `EVENTS`. Returns true if a
/// tokenmoth hook was already present under all of them (no change made).
/// Preserves all unrelated settings.
fn install_hook(root: &mut Value, command: &str) -> anyhow::Result<bool> {
    let obj = root
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("settings root is not a JSON object"))?;
    let hooks = obj
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("`hooks` is not an object"))?;

    let mut added = false;
    for ev in EVENTS {
        let arr = hooks
            .entry(ev)
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or_else(|| anyhow::anyhow!("`hooks.{ev}` is not an array"))?;
        if !arr.iter().any(group_has_tokenmoth) {
            arr.push(json!({ "hooks": [ { "type": "command", "command": command } ] }));
            added = true;
        }
    }
    Ok(!added)
}

/// Remove every tokenmoth group across all our events, then tidy up empty
/// containers. Returns how many groups were removed.
fn uninstall_hook(root: &mut Value) -> usize {
    let Some(obj) = root.as_object_mut() else { return 0 };
    let Some(hooks) = obj.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return 0 };

    let mut removed = 0;
    for ev in EVENTS {
        let empty = if let Some(arr) = hooks.get_mut(ev).and_then(|a| a.as_array_mut()) {
            let before = arr.len();
            arr.retain(|g| !group_has_tokenmoth(g));
            removed += before - arr.len();
            arr.is_empty()
        } else {
            false
        };
        if empty {
            hooks.remove(ev);
        }
    }
    if hooks.is_empty() {
        obj.remove("hooks");
    }
    removed
}

fn group_has_tokenmoth(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(|c| c.as_str())
                    .map(|c| c.contains("tokenmoth report"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn cmd_report(key: &str, api_url: &str, detach: bool) -> anyhow::Result<()> {
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf)?;

    if detach && std::env::var_os("TOKENMOTH_DETACHED").is_none() {
        return spawn_detached(key, api_url, &buf);
    }
    process_report(key, api_url, &buf)
}

/// Re-spawn `report` (without --detach) fully backgrounded, feeding the hook
/// payload via its stdin, then return immediately. The orphaned child finishes
/// the transcript parse + POST after the hook process has already exited.
fn spawn_detached(key: &str, api_url: &str, payload: &str) -> anyhow::Result<()> {
    let exe = std::env::current_exe()?;
    let mut child = std::process::Command::new(exe)
        .args(["report", "--key", key, "--api-url", api_url])
        .env("TOKENMOTH_DETACHED", "1")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    if let Some(mut si) = child.stdin.take() {
        let _ = si.write_all(payload.as_bytes());
    }
    // Intentionally do NOT wait — let the child outlive us.
    Ok(())
}

fn process_report(key: &str, api_url: &str, buf: &str) -> anyhow::Result<()> {
    let hook: Value = serde_json::from_str(buf).unwrap_or_else(|_| json!({}));
    let session_id = hook.get("session_id").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let cwd = hook.get("cwd").and_then(|v| v.as_str()).unwrap_or(".").to_string();
    let transcript_path = hook.get("transcript_path").and_then(|v| v.as_str());

    let content = transcript_path
        .and_then(|tp| std::fs::read_to_string(tp).ok())
        .unwrap_or_default();
    // Aggregation semantics: SUM every message's usage across the session = total
    // tokens processed (incl. repeated cache reads). `model` = last seen. The
    // resolver attributes hook overhead to the owning plugin (scans local configs).
    let p = parse_transcript(&content, &PluginResolver::load());

    // Prefer the real git repo the session worked in over the launch cwd (#109).
    let repo = resolve_repo(Some(&cwd), &p.cwd_counts);
    let mcp = mcp_servers(Some(&cwd), &p.cwd_counts);
    // Live report: no ended_at → the server stamps now() (current behavior).
    let body = telemetry_body(&session_id, &repo, &p, None, &mcp);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    // Fire-and-forget: a failed POST must never surface to the user's session.
    let _ = post_telemetry(&client, api_url, key, &body);
    Ok(())
}

/// POST a telemetry body to `/v1/telemetry`. Returns Ok(true) on a 2xx.
fn post_telemetry(
    client: &reqwest::blocking::Client,
    api_url: &str,
    key: &str,
    body: &Value,
) -> anyhow::Result<bool> {
    let res = client
        .post(format!("{}/v1/telemetry", api_url.trim_end_matches('/')))
        .bearer_auth(key)
        .json(body)
        .send()?;
    Ok(res.status().is_success())
}

/// One-time backfill: re-ingest every local transcript so historical sessions
/// gain the plugin overhead breakdown. Idempotent — the API upserts by session
/// id — and each session keeps its real end time (sent as `ended_at`), so the
/// timeline is preserved. Per-file failures are counted, never fatal.
fn cmd_backfill(
    key: &str,
    api_url: &str,
    dry_run: bool,
    repo_filter: Option<&str>,
    since: Option<&str>,
    yes: bool,
    full: bool,
) -> anyhow::Result<()> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("could not resolve home dir"))?;
    let base = std::env::var_os("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join(".claude"))
        .join("projects");

    // Effective cutoff: an explicit --since always wins; otherwise re-use the
    // saved cutoff from the last successful backfill (per api_url) so a re-run
    // only sends sessions newer than what already landed. --full ignores it.
    let saved_cutoff = if since.is_none() && !full {
        read_cutoff(api_url)
    } else {
        None
    };
    let effective_since: Option<&str> = since.or(saved_cutoff.as_deref());
    if since.is_none() && saved_cutoff.is_some() {
        println!(
            "resuming from saved cutoff {} (use --full to re-send everything)",
            effective_since.unwrap_or("")
        );
    }

    let mut transcripts = Vec::new();
    collect_jsonl(&base, &mut transcripts);
    transcripts.sort();
    if transcripts.is_empty() {
        println!("no transcripts found under {}", base.display());
        return Ok(());
    }
    println!(
        "found {} transcript(s) under {}{}",
        transcripts.len(),
        base.display(),
        if dry_run { " — dry run, nothing will be sent" } else { "" }
    );

    let resolver = PluginResolver::load();

    // A session can span several .jsonl files (sidechains, post-compaction
    // continuations). They share one `sessionId` and all upsert the SAME row, so
    // keep only the richest parse per session (most total tokens) — that's the
    // main transcript the live SessionEnd hook would have used. Without this, a
    // 0-token fragment posted last would clobber the real row.
    let mut best: HashMap<String, Backfilled> = HashMap::new();
    let mut skipped = 0u32;
    for path in &transcripts {
        let Ok(content) = std::fs::read_to_string(path) else {
            skipped += 1;
            continue;
        };
        let p = parse_transcript(&content, &resolver);
        let Some(session_id) = p.session_id.clone() else {
            skipped += 1; // no session id → can't upsert the right row
            continue;
        };
        let repo = resolve_repo(None, &p.cwd_counts);
        // Privacy/scoping filters (apply before the payload is even built).
        if let Some(want) = repo_filter {
            if repo != want {
                continue;
            }
        }
        if let Some(cutoff) = effective_since {
            // ISO-8601 timestamps order lexically, so a prefix compare against a
            // YYYY-MM-DD cutoff is correct. No timestamp → treat as before cutoff.
            match p.last_ts.as_deref() {
                Some(ts) if ts >= cutoff => {}
                _ => continue,
            }
        }
        let mcp = mcp_servers(None, &p.cwd_counts);
        let score = p.input + p.output + p.cread + p.ccreate + p.overhead;
        let body = telemetry_body(&session_id, &repo, &p, p.last_ts.as_deref(), &mcp);
        let entry = Backfilled { repo, score, body, ended_at: p.last_ts.clone() };
        match best.get(&session_id) {
            Some(prev) if prev.score >= score => {}
            _ => { best.insert(session_id, entry); }
        }
    }

    let sessions: Vec<Backfilled> = best.into_values().collect();
    let total = sessions.len();
    if total == 0 {
        println!("nothing to backfill after filters ({skipped} file(s) skipped).");
        return Ok(());
    }

    // Compact summary (repo + count) — never dump per-session detail, which on a
    // large history is noise and leaks repo names line by line.
    let mut by_repo: BTreeMap<&str, u32> = BTreeMap::new();
    for s in &sessions {
        *by_repo.entry(s.repo.as_str()).or_default() += 1;
    }
    println!(
        "{total} unique session(s) across {} repo(s) ({skipped} file(s) skipped):",
        by_repo.len()
    );
    for (repo, n) in &by_repo {
        println!("  {repo}: {n}");
    }

    if dry_run {
        println!("dry run — nothing sent.");
        return Ok(());
    }

    // Last chance to bail before anything leaves the machine.
    if !yes && !confirm(&format!("Send {total} session(s) to {api_url}?")) {
        println!("aborted.");
        return Ok(());
    }

    // The newest end time in this batch — saved as the cutoff once everything
    // lands so the next run skips straight to newer sessions.
    let batch_max = sessions.iter().filter_map(|s| s.ended_at.clone()).max();

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;
    let (mut sent, mut failed) = (0u32, 0u32);
    for (i, s) in sessions.iter().enumerate() {
        if post_with_retry(&client, api_url, key, &s.body) {
            sent += 1;
        } else {
            failed += 1;
        }
        // Gentle pace to stay under the API's per-minute rate limit (retries on
        // 429 add their own backoff on top).
        std::thread::sleep(Duration::from_millis(500));
        if (i + 1) % 25 == 0 {
            println!("  …{}/{total} (sent {sent}, failed {failed})", i + 1);
        }
    }
    println!("✓ backfill done — sent {sent}, failed {failed}, skipped {skipped}");
    if failed > 0 {
        eprintln!(
            "{failed} session(s) failed to send. Re-running is safe (idempotent) — \
             already-sent sessions won't be duplicated."
        );
        std::process::exit(1);
    }
    // Only advance the cutoff on a fully clean run — a partial failure must stay
    // re-sendable on the next pass.
    if let Some(ts) = batch_max {
        if let Err(e) = write_cutoff(api_url, &ts) {
            eprintln!("note: couldn't save backfill cutoff: {e}");
        }
    }
    Ok(())
}

/// Per-machine state file recording the last backfill cutoff for each api_url,
/// so re-runs only send newer sessions. Keyed by api_url to keep dev/prod and
/// multiple accounts from clobbering each other's progress.
fn cutoff_state_path() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".tokenmoth").join("backfill-state.json"))
}

fn read_cutoff(api_url: &str) -> Option<String> {
    let raw = std::fs::read_to_string(cutoff_state_path()?).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    v.get(api_url)?.as_str().map(str::to_string)
}

fn write_cutoff(api_url: &str, ts: &str) -> anyhow::Result<()> {
    let path = cutoff_state_path().ok_or_else(|| anyhow::anyhow!("no home dir"))?;
    let mut v: Value = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}));
    if let Some(obj) = v.as_object_mut() {
        obj.insert(api_url.to_string(), json!(ts));
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(&v)? + "\n")?;
    Ok(())
}

/// Prompt y/N on the terminal. Any non-affirmative answer (incl. EOF) → false.
fn confirm(prompt: &str) -> bool {
    print!("{prompt} [y/N] ");
    let _ = std::io::stdout().flush();
    let mut line = String::new();
    if std::io::stdin().read_line(&mut line).is_err() {
        return false;
    }
    matches!(line.trim().to_ascii_lowercase().as_str(), "y" | "yes")
}

/// POST one session with bounded retries. The plain `post_telemetry` maps every
/// non-2xx (incl. 429) to failure with no retry, which on a bulk run silently
/// drops sessions the moment the per-minute limit trips. Here:
///   * 2xx                  → success
///   * 429 / 5xx / network  → back off and retry (honors `Retry-After` on 429)
///   * other 4xx            → permanent, no retry (e.g. 401 bad key, 400 payload)
fn post_with_retry(client: &reqwest::blocking::Client, api_url: &str, key: &str, body: &Value) -> bool {
    const MAX_ATTEMPTS: u32 = 5;
    let url = format!("{}/v1/telemetry", api_url.trim_end_matches('/'));
    for attempt in 0..MAX_ATTEMPTS {
        let last = attempt + 1 == MAX_ATTEMPTS;
        match client.post(&url).bearer_auth(key).json(body).send() {
            Ok(res) => {
                let status = res.status();
                if status.is_success() {
                    return true;
                }
                // Permanent client errors (except 429) won't change on retry.
                if status.is_client_error() && status.as_u16() != 429 {
                    return false;
                }
                if last {
                    return false;
                }
                let wait = retry_after(&res).unwrap_or_else(|| backoff(attempt));
                std::thread::sleep(wait);
            }
            Err(_) => {
                if last {
                    return false;
                }
                std::thread::sleep(backoff(attempt));
            }
        }
    }
    false
}

/// Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s.
fn backoff(attempt: u32) -> Duration {
    Duration::from_secs((1u64 << attempt.min(5)).min(30))
}

/// Parse a numeric `Retry-After: <seconds>` header into a wait duration.
fn retry_after(res: &reqwest::blocking::Response) -> Option<Duration> {
    res.headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse::<u64>()
        .ok()
        .map(Duration::from_secs)
}

/// One deduped session ready to (re-)ingest.
struct Backfilled {
    repo: String,
    score: i64,
    body: Value,
    ended_at: Option<String>,
}

/// Recursively collect `*.jsonl` files under `dir` (empty on I/O error).
fn collect_jsonl(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_jsonl(&p, out);
        } else if p.extension().and_then(|x| x.to_str()) == Some("jsonl") {
            out.push(p);
        }
    }
}

/// Build the telemetry payload. PRIVACY INVARIANT: this is the ONLY data that
/// leaves the machine — token counts, the model name, the repo *basename*, and
/// per-hook *names* + counts. Never the absolute path, the transcript, or any
/// hook/chat content (a stray `.env` pasted into a session must never escape).
/// Keep this whitelist tight; `telemetry_body_only_whitelisted_fields` enforces it.
/// `ended_at` (a timestamp, no content) is included only for backfill, so a
/// re-ingest preserves the session's real end time instead of `now()`.
/// `mcp_servers` is the list of MCP server *names* active for the project (#106) —
/// names only, never paths or schemas. `turn_usage`/`baseline_tokens`/`turn_count`
/// are pure token counts per API call (#152); `mcp_calls` is invocation counts
/// keyed by server name (#153); `model_usage` is per-model token totals keyed by
/// model name (#model-breakdown). Nothing here can carry content.
fn telemetry_body(
    session_id: &str,
    repo: &str,
    p: &Parsed,
    ended_at: Option<&str>,
    mcp: &[String],
) -> Value {
    // Baseline = the first API call's full context (input + cache_read +
    // cache_creation) ≈ system prompt + tool/MCP schemas + hooks — measured,
    // not estimated. Every later turn re-reads at least this much (#152).
    let baseline = p.turns.first().map(|t| t[0] + t[1] + t[2]).unwrap_or(0);
    let mut body = json!({
        "session_id": session_id,
        // basename only — never the absolute cwd (no username / dir structure leak)
        "project_path": repo,
        "repo": repo,
        "model": p.model,
        "input_tokens": p.input,
        "output_tokens": p.output,
        "cache_read_input_tokens": p.cread,
        "cache_creation_input_tokens": p.ccreate,
        "hook_overhead_tokens": p.overhead,
        "hook_overhead_breakdown": p.breakdown,
        "mcp_servers": mcp,
        "mcp_calls": p.mcp_calls,
        "model_usage": p.model_usage,
        "baseline_tokens": baseline,
        "turn_count": p.turns.len(),
        "turn_usage": downsample_turns(&p.turns),
    });
    if let Some(ts) = ended_at {
        body["ended_at"] = json!(ts);
    }
    body
}

/// Cap the per-turn series so a 1000-call session still fits the API body
/// limit: chunks of adjacent calls are averaged (shape-preserving — sums for
/// the anatomy come from the session totals, not from this series).
const MAX_TURN_POINTS: usize = 360;

fn downsample_turns(turns: &[[i64; 4]]) -> Vec<[i64; 4]> {
    if turns.len() <= MAX_TURN_POINTS {
        return turns.to_vec();
    }
    let chunk = turns.len().div_ceil(MAX_TURN_POINTS);
    turns
        .chunks(chunk)
        .map(|c| {
            let n = c.len() as i64;
            let mut s = [0i64; 4];
            for t in c {
                for (acc, v) in s.iter_mut().zip(t) {
                    *acc += v;
                }
            }
            s.map(|v| v / n)
        })
        .collect()
}

/// MCP server names active for a session's project. Claude Code keeps a per-project
/// MCP log dir at `<cache>/claude-cli-nodejs/<slug>/mcp-logs-<server>/`; the presence
/// of those dirs is the only reliable local signal of which MCP servers were loaded.
/// Their tool-schema *sizes* aren't recorded anywhere measurable — that cost is
/// already inside the session's token totals, just not separable per server (#106).
/// PRIVACY: returns only server *names* — never the cwd/slug/path or any content.
fn mcp_servers(primary_cwd: Option<&str>, cwd_counts: &HashMap<String, i64>) -> Vec<String> {
    let Some(cache) = dirs::cache_dir() else { return Vec::new() };
    // Try the hook cwd first, then the dominant transcript cwd.
    let mut cwds: Vec<String> = primary_cwd.map(|c| vec![c.to_string()]).unwrap_or_default();
    let mut counted: Vec<(&String, &i64)> = cwd_counts.iter().collect();
    counted.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
    cwds.extend(counted.into_iter().map(|(c, _)| c.clone()));

    for cwd in cwds {
        // Claude Code slugifies the project path by replacing every `/` with `-`.
        let slug = cwd.replace('/', "-");
        let dir = cache.join("claude-cli-nodejs").join(&slug);
        let mut servers: Vec<String> = read_subdirs(&dir)
            .iter()
            .filter_map(|p| p.file_name().and_then(|s| s.to_str()))
            .filter_map(|n| n.strip_prefix("mcp-logs-").map(str::to_string))
            .collect();
        if !servers.is_empty() {
            servers.sort();
            return servers;
        }
    }
    Vec::new()
}

/// Aggregated transcript stats.
#[derive(Default)]
struct Parsed {
    input: i64,
    output: i64,
    cread: i64,
    ccreate: i64,
    overhead: i64,
    /// Per-hook overhead tokens, keyed by `hookName` (#83).
    breakdown: HashMap<String, i64>,
    /// Per-API-call usage `[input, cache_read, cache_creation, output]` in
    /// transcript order — the raw material for the Cost Anatomy view (#152).
    turns: Vec<[i64; 4]>,
    /// Tool invocations per MCP server, parsed from `tool_use` names
    /// (`mcp__<server>__<tool>`). Server segment only — never the tool name
    /// or its input (#153).
    mcp_calls: HashMap<String, i64>,
    /// Per-model token totals `[input, cache_read, cache_creation, output]`,
    /// keyed by model name. `model` below is only "last seen"; this captures
    /// every model a session actually used (e.g. a Fable detour inside an Opus
    /// session) so the breakdown isn't mis-attributed. Model ids are not
    /// content — names + counts only.
    model_usage: HashMap<String, [i64; 4]>,
    model: Option<String>,
    /// Session id from the transcript (`sessionId`) — used by `backfill` to
    /// upsert the right row. Empty on a live report (id comes from the hook).
    session_id: Option<String>,
    /// Per-`cwd` line counts across the transcript — lets repo attribution pick
    /// the dominant git repo a session actually worked in, instead of the
    /// home/non-repo dir it was launched from (#109).
    cwd_counts: HashMap<String, i64>,
    /// Last message `timestamp` seen — the session's real end time, sent by
    /// `backfill` as `ended_at` so re-ingest preserves history instead of now().
    last_ts: Option<String>,
}

/// Sum per-message `usage` across a transcript JSONL, plus estimate hook/plugin
/// overhead from `attachment` entries that carry a `hookEvent` + injected
/// `content` (SessionStart plugins, MCP context, PreToolUse hooks, …), attributed
/// per `hookName`. Token estimate ≈ content length / 4.
fn parse_transcript(content: &str, resolver: &PluginResolver) -> Parsed {
    let mut p = Parsed::default();
    for line in content.lines() {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let msg = v.get("message");
        if let Some(u) = msg.and_then(|m| m.get("usage")) {
            let (i, o, cr, cc) = (
                as_i64(u, "input_tokens"),
                as_i64(u, "output_tokens"),
                as_i64(u, "cache_read_input_tokens"),
                as_i64(u, "cache_creation_input_tokens"),
            );
            p.input += i;
            p.output += o;
            p.cread += cr;
            p.ccreate += cc;
            p.turns.push([i, cr, cc, o]);
            // Attribute this call's tokens to the model that produced it (same
            // message). Synthetic pseudo-models (`<synthetic>`) fold into
            // "unknown" so per-model totals still sum to the session total.
            let model = msg
                .and_then(|m| m.get("model"))
                .and_then(|x| x.as_str())
                .filter(|m| !m.starts_with('<'))
                .unwrap_or("unknown");
            let e = p.model_usage.entry(model.to_string()).or_insert([0; 4]);
            e[0] += i;
            e[1] += cr;
            e[2] += cc;
            e[3] += o;
        }
        // Count MCP tool invocations: assistant content carries `tool_use`
        // blocks named `mcp__<server>__<tool>`. PRIVACY: only the server
        // segment is kept — never the tool name, input, or result (#153).
        if let Some(content) = msg.and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
            for item in content {
                if item.get("type").and_then(|t| t.as_str()) != Some("tool_use") {
                    continue;
                }
                let Some(name) = item.get("name").and_then(|n| n.as_str()) else { continue };
                let Some(rest) = name.strip_prefix("mcp__") else { continue };
                let server = rest.split("__").next().unwrap_or(rest);
                if !server.is_empty() {
                    *p.mcp_calls.entry(server.to_string()).or_insert(0) += 1;
                }
            }
        }
        if let Some(m) = msg.and_then(|m| m.get("model")).and_then(|x| x.as_str()) {
            // Skip Claude Code's pseudo-models (`<synthetic>`, `<unknown>`) so a
            // session ending on a synthetic turn keeps its real model (#108).
            if !m.starts_with('<') {
                p.model = Some(m.to_string());
            }
        }
        // Session metadata for backfill / repo attribution. `sessionId` (first
        // wins) and the `timestamp` (last wins = real end time); `cwd` is counted
        // so we can pick the dominant git repo a session actually worked in (#109).
        if p.session_id.is_none() {
            if let Some(s) = v.get("sessionId").and_then(|x| x.as_str()) {
                p.session_id = Some(s.to_string());
            }
        }
        if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
            *p.cwd_counts.entry(c.to_string()).or_insert(0) += 1;
        }
        if let Some(ts) = v.get("timestamp").and_then(|x| x.as_str()) {
            p.last_ts = Some(ts.to_string());
        }
        // Hook/plugin context injected on a lifecycle event lives under
        // `attachment` (hook_success / hook_additional_context), carrying
        // `hookEvent` + `hookName` + the injected `content`.
        if let Some(a) = v.get("attachment") {
            if let Some(ev) = a.get("hookEvent").and_then(|x| x.as_str()) {
                if let Some(c) = a.get("content").and_then(|x| x.as_str()) {
                    let tok = (hook_content_len(c) / 4) as i64;
                    if tok > 0 {
                        p.overhead += tok;
                        // Attribute to the specific hook script (which plugin) so the
                        // breakdown reads "inject-claude-md ~12k" instead of lumping
                        // every plugin under "SessionStart:startup".
                        let command = a.get("command").and_then(|x| x.as_str()).unwrap_or("");
                        let hook_name = a.get("hookName").and_then(|x| x.as_str());
                        // Prefer the owning plugin's name; fall back to script/hook label.
                        let label = resolver
                            .resolve(command)
                            .map(str::to_string)
                            .unwrap_or_else(|| hook_label(ev, hook_name, command));
                        *p.breakdown.entry(label).or_insert(0) += tok;
                    }
                }
            }
        }
    }
    p
}

fn as_i64(u: &Value, k: &str) -> i64 {
    u.get(k).and_then(|x| x.as_i64()).unwrap_or(0)
}

/// Basename stem of the first script-looking token in a hook command, e.g.
/// `node "${CLAUDE_PLUGIN_ROOT}/hooks/inject-claude-md.mjs"` → `inject-claude-md`.
/// PRIVACY: only the stem is returned — never the path or `${CLAUDE_PLUGIN_ROOT}`.
fn script_stem(command: &str) -> Option<String> {
    for tok in command.split(|c: char| c.is_whitespace() || c == '"' || c == '\'') {
        let base = tok.rsplit('/').next().unwrap_or(tok);
        if let Some((stem, ext)) = base.rsplit_once('.') {
            if matches!(ext, "mjs" | "cjs" | "js" | "ts" | "sh" | "py") && !stem.is_empty() {
                return Some(stem.to_string());
            }
        }
    }
    None
}

/// Human label for a hook's overhead bucket when its plugin can't be resolved.
/// Prefer the hook script's basename stem; fall back to the hook name / event
/// when the command runs no script. PRIVACY: only the basename stem is returned —
/// never the full path, `${CLAUDE_PLUGIN_ROOT}`, or any content.
fn hook_label(hook_event: &str, hook_name: Option<&str>, command: &str) -> String {
    if let Some(stem) = script_stem(command) {
        return stem;
    }
    hook_name.filter(|s| !s.is_empty()).unwrap_or(hook_event).to_string()
}

/// Maps a transcript hook `command` to the plugin that declared it, by scanning
/// the locally-installed plugin configs at SessionEnd. Claude Code records either
/// the hook's `command` or (when set) its `statusMessage` in the transcript — so
/// both strings are indexed, plus the script basename stem as a fallback. Lets the
/// overhead breakdown read `caveman` / `vercel` instead of raw `SessionStart:clear`.
/// PRIVACY: only plugin *names* are ever produced — never paths or content.
#[derive(Default)]
struct PluginResolver {
    by_command: HashMap<String, String>,
    by_script: HashMap<String, String>,
}

impl PluginResolver {
    /// Scan `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` for hook
    /// declarations (`.claude-plugin/plugin.json`, `hooks/hooks.json`). Best-effort:
    /// an empty resolver (→ today's labels) if the dir is absent or unreadable.
    fn load() -> Self {
        let mut r = Self::default();
        let Some(home) = dirs::home_dir() else { return r };
        let base = std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".claude"))
            .join("plugins/cache");
        for mp in read_subdirs(&base) {
            for plugin_dir in read_subdirs(&mp) {
                let Some(plugin) = plugin_dir.file_name().and_then(|s| s.to_str()) else {
                    continue;
                };
                let plugin = plugin.to_string();
                for ver in read_subdirs(&plugin_dir) {
                    for cfg in [
                        ver.join(".claude-plugin/plugin.json"),
                        ver.join("hooks/hooks.json"),
                    ] {
                        if let Ok(txt) = std::fs::read_to_string(&cfg) {
                            if let Ok(v) = serde_json::from_str::<Value>(&txt) {
                                r.index(&plugin, &v);
                            }
                        }
                    }
                }
            }
        }
        r
    }

    /// Walk a plugin config, registering every `{command, statusMessage?}` hook
    /// declaration under `plugin`. First writer wins (stable across duplicates).
    fn index(&mut self, plugin: &str, v: &Value) {
        match v {
            Value::Object(map) => {
                if let Some(cmd) = map.get("command").and_then(|c| c.as_str()) {
                    self.by_command.entry(cmd.to_string()).or_insert_with(|| plugin.to_string());
                    if let Some(stem) = script_stem(cmd) {
                        self.by_script.entry(stem).or_insert_with(|| plugin.to_string());
                    }
                }
                if let Some(msg) = map.get("statusMessage").and_then(|c| c.as_str()) {
                    self.by_command.entry(msg.to_string()).or_insert_with(|| plugin.to_string());
                }
                map.values().for_each(|val| self.index(plugin, val));
            }
            Value::Array(arr) => arr.iter().for_each(|val| self.index(plugin, val)),
            _ => {}
        }
    }

    /// Plugin owning a transcript hook `command`, if known.
    fn resolve(&self, command: &str) -> Option<&str> {
        if let Some(p) = self.by_command.get(command) {
            return Some(p);
        }
        let stem = script_stem(command)?;
        self.by_script.get(&stem).map(String::as_str)
    }
}

/// Immediate subdirectories of `dir` (empty on any I/O error).
fn read_subdirs(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect()
}

/// Byte length of a hook's injected content. Claude Code truncates large hook
/// outputs in the transcript, storing a preview plus `Full output saved to:
/// <path>`. When that marker is present we measure the FULL file's size via
/// `metadata` — the file is never read or transmitted, only its length feeds the
/// token estimate — so overhead reflects the real injection, not the ~2 KB
/// preview. Falls back to the in-line content length if the file is gone.
fn hook_content_len(content: &str) -> usize {
    const MARKER: &str = "Full output saved to: ";
    if let Some(i) = content.find(MARKER) {
        let path = content[i + MARKER.len()..].lines().next().unwrap_or("").trim();
        if let Ok(meta) = std::fs::metadata(path) {
            return meta.len() as usize;
        }
    }
    content.len()
}

fn git_repo_name(cwd: &str) -> Option<String> {
    let out = std::process::Command::new("git")
        .args(["-C", cwd, "rev-parse", "--show-toplevel"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let top = String::from_utf8(out.stdout).ok()?;
    Some(top.trim().rsplit('/').next()?.to_string())
}

fn repo_from_path(p: &str) -> String {
    p.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

/// Resolve the repo a session belongs to, preferring a real git repo so sessions
/// launched from a non-repo dir (e.g. `~`) aren't bucketed under the home folder
/// name (#109). Order: the hook cwd if it's a git repo → the most-frequent
/// transcript cwd that is → the basename of the best cwd we have.
/// PRIVACY: returns only a repo *basename*, never a path.
fn resolve_repo(hook_cwd: Option<&str>, cwd_counts: &HashMap<String, i64>) -> String {
    // 1) the cwd the session ended in, if it's a git repo — most accurate.
    if let Some(c) = hook_cwd {
        if let Some(r) = git_repo_name(c) {
            return r;
        }
    }
    // 2) the dominant transcript cwd that is a git repo (ties broken by path).
    let mut cwds: Vec<(&String, &i64)> = cwd_counts.iter().collect();
    cwds.sort_by(|a, b| b.1.cmp(a.1).then_with(|| a.0.cmp(b.0)));
    for (cwd, _) in &cwds {
        if let Some(r) = git_repo_name(cwd) {
            return r;
        }
    }
    // 3) fallback: basename of the dominant transcript cwd (where work happened),
    //    else the hook cwd. Prefer the transcript cwd so a home-launched session
    //    isn't labeled after the home dir when no cwd resolves to a git repo now.
    let best = cwds
        .first()
        .map(|(c, _)| (*c).clone())
        .or_else(|| hook_cwd.map(str::to_string))
        .unwrap_or_else(|| ".".to_string());
    repo_from_path(&best)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_then_caps() {
        assert_eq!(backoff(0), Duration::from_secs(1));
        assert_eq!(backoff(1), Duration::from_secs(2));
        assert_eq!(backoff(2), Duration::from_secs(4));
        assert_eq!(backoff(3), Duration::from_secs(8));
        // capped at 30s no matter how high the attempt count climbs
        assert_eq!(backoff(10), Duration::from_secs(30));
    }

    #[test]
    fn iso_since_prefix_compare() {
        // The --since filter relies on lexical ordering of ISO-8601 timestamps.
        assert!("2026-03-04T12:00:00Z" >= "2026-01-01");
        assert!("2025-12-31T23:59:59Z" < "2026-01-01");
    }

    #[test]
    fn aggregates_usage_and_takes_last_model() {
        let t = concat!(
            r#"{"type":"user","message":{"role":"user","content":"hi"}}"#,
            "\n",
            r#"{"type":"assistant","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":200,"cache_read_input_tokens":10,"cache_creation_input_tokens":1}}}"#,
            "\n",
            r#"{"type":"assistant","message":{"model":"claude-opus-4-8","usage":{"input_tokens":50,"output_tokens":80,"cache_read_input_tokens":5,"cache_creation_input_tokens":2}}}"#,
            "\n",
            // hook-injected context (8 chars → 2 tokens) — counts as overhead, not usage
            r#"{"type":"attachment","attachment":{"type":"hook_success","hookEvent":"SessionStart","hookName":"caveman","content":"abcdefgh"}}"#,
            "\n",
            // attachment without a hookEvent must be ignored
            r#"{"type":"attachment","attachment":{"type":"file","content":"ignored padding here"}}"#,
        );
        let p = parse_transcript(t, &PluginResolver::default());
        assert_eq!((p.input, p.output, p.cread, p.ccreate), (150, 280, 15, 3));
        assert_eq!(p.overhead, 2);
        assert_eq!(p.breakdown.get("caveman"), Some(&2));
        assert_eq!(p.model.as_deref(), Some("claude-opus-4-8"));
        // per-turn series in transcript order: [input, cache_read, cache_creation, output]
        assert_eq!(p.turns, vec![[100, 10, 1, 200], [50, 5, 2, 80]]);
        // every model the session used is attributed separately — not just the
        // last one — so a sonnet/fable detour inside an opus session is visible.
        assert_eq!(p.model_usage.get("claude-sonnet-4-6"), Some(&[100, 10, 1, 200]));
        assert_eq!(p.model_usage.get("claude-opus-4-8"), Some(&[50, 5, 2, 80]));
    }

    #[test]
    fn counts_mcp_tool_calls_by_server_only() {
        let t = concat!(
            r#"{"message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__vercel__list_projects","input":{"secret":"never-sent"}},{"type":"tool_use","name":"mcp__vercel__get_project"},{"type":"text","text":"hi"}]}}"#,
            "\n",
            r#"{"message":{"role":"assistant","content":[{"type":"tool_use","name":"mcp__figma__get_screenshot"},{"type":"tool_use","name":"Bash"}]}}"#,
        );
        let p = parse_transcript(t, &PluginResolver::default());
        assert_eq!(p.mcp_calls.get("vercel"), Some(&2));
        assert_eq!(p.mcp_calls.get("figma"), Some(&1));
        // built-in tools (no mcp__ prefix) are never counted
        assert_eq!(p.mcp_calls.len(), 2);
    }

    #[test]
    fn downsample_keeps_short_series_and_averages_long_ones() {
        let short = vec![[1, 2, 3, 4]; 10];
        assert_eq!(downsample_turns(&short), short);

        let long: Vec<[i64; 4]> = (0..720).map(|i| [i, 0, 0, 0]).collect();
        let ds = downsample_turns(&long);
        assert!(ds.len() <= MAX_TURN_POINTS);
        // chunk of [0,1] averages to 0 (integer), [2,3] → 2, …
        assert_eq!(ds[0], [0, 0, 0, 0]);
        assert_eq!(ds[1], [2, 0, 0, 0]);
    }

    #[test]
    fn parse_transcript_ignores_garbage_lines() {
        let p = parse_transcript("not json\n{}\n", &PluginResolver::default());
        assert_eq!((p.input, p.output, p.cread, p.ccreate, p.overhead), (0, 0, 0, 0, 0));
        assert!(p.breakdown.is_empty());
        assert_eq!(p.model, None);
    }

    #[test]
    fn install_is_idempotent_and_preserves_other_hooks() {
        let mut root = json!({
            "model": "opus",
            "hooks": {
                "PreToolUse": [
                    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo keep" } ] }
                ]
            }
        });
        let cmd = "tokenmoth report --key k --api-url u --detach";
        assert_eq!(install_hook(&mut root, cmd).unwrap(), false); // installed
        assert_eq!(install_hook(&mut root, cmd).unwrap(), true); // idempotent no-op
        assert!(root["hooks"]["PreToolUse"].is_array()); // preserved
        assert_eq!(root["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert_eq!(root["hooks"]["SessionEnd"].as_array().unwrap().len(), 1);
        assert_eq!(root["model"], "opus");
    }

    #[test]
    fn uninstall_removes_only_tokenmoth_and_tidies() {
        let group = json!({ "hooks": [ { "type": "command", "command": "tokenmoth report --key k --detach" } ] });
        let mut root = json!({
            "hooks": {
                "PreToolUse": [
                    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo keep" } ] }
                ],
                "Stop": [ group.clone() ],
                "SessionEnd": [ group.clone() ]
            }
        });
        assert_eq!(uninstall_hook(&mut root), 2); // one per event
        assert!(root["hooks"]["PreToolUse"].is_array()); // kept
        assert!(root["hooks"].get("Stop").is_none()); // emptied + tidied
        assert!(root["hooks"].get("SessionEnd").is_none()); // emptied + tidied
    }

    #[test]
    fn uninstall_on_clean_settings_is_noop() {
        let mut root = json!({ "model": "opus" });
        assert_eq!(uninstall_hook(&mut root), 0);
        assert_eq!(root["model"], "opus");
    }

    #[test]
    fn repo_basename_trims_trailing_slash() {
        assert_eq!(repo_from_path("/a/b/illumine/"), "illumine");
        assert_eq!(repo_from_path("/a/b/illumine"), "illumine");
    }

    #[test]
    fn hook_content_len_uses_full_file_when_truncated() {
        // no marker → in-line length
        assert_eq!(hook_content_len("abcdefgh"), 8);

        // marker present → full file size (not the preview length)
        let path = std::env::temp_dir().join("tm_hook_full_output_test.txt");
        std::fs::write(&path, vec![b'x'; 40_000]).unwrap();
        let content = format!(
            "Output too large (40KB). Full output saved to: {}\nPreview (first 2KB):\nxxxx",
            path.display()
        );
        assert_eq!(hook_content_len(&content), 40_000);
        let _ = std::fs::remove_file(&path);

        // marker but missing file → falls back to in-line length
        let missing = "Full output saved to: /no/such/file_tm_test.txt\npreview";
        assert_eq!(hook_content_len(missing), missing.len());
    }

    #[test]
    fn hook_label_attributes_to_script_then_falls_back() {
        // script in command → basename stem (no path leaked)
        assert_eq!(
            hook_label("SessionStart", Some("SessionStart:startup"),
                "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-claude-md.mjs\""),
            "inject-claude-md"
        );
        assert_eq!(
            hook_label("PreToolUse", Some("PreToolUse:Bash"),
                "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pretooluse-skill-inject.mjs\""),
            "pretooluse-skill-inject"
        );
        // no script → hook name fallback (e.g. caveman's free-text command)
        assert_eq!(
            hook_label("SessionStart", Some("SessionStart:startup"), "Loading caveman mode..."),
            "SessionStart:startup"
        );
        // empty command + no hook name → event
        assert_eq!(hook_label("PreToolUse", None, ""), "PreToolUse");
    }

    #[test]
    fn plugin_resolver_maps_command_and_status_message() {
        // Mimics a plugin config: a script hook + a free-text hook with a
        // statusMessage (Claude Code records the statusMessage, not the command).
        let cfg = json!({
            "hooks": {
                "SessionStart": [{
                    "hooks": [
                        { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-claude-md.mjs\"" },
                        { "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/activate.js",
                          "statusMessage": "Loading caveman mode..." }
                    ]
                }]
            }
        });
        let mut r = PluginResolver::default();
        r.index("caveman", &cfg);

        // exact command match
        assert_eq!(r.resolve("node \"${CLAUDE_PLUGIN_ROOT}/hooks/inject-claude-md.mjs\""), Some("caveman"));
        // statusMessage (free-text) is what the transcript carries for that hook
        assert_eq!(r.resolve("Loading caveman mode..."), Some("caveman"));
        // script-stem fallback when the command differs but the script matches
        assert_eq!(r.resolve("/abs/path/hooks/inject-claude-md.mjs --flag"), Some("caveman"));
        // unknown → None (caller falls back to hook_label)
        assert_eq!(r.resolve("PreToolUse:Bash"), None);
    }

    #[test]
    fn telemetry_body_only_whitelisted_fields_no_absolute_path() {
        let p = Parsed {
            input: 1,
            output: 2,
            cread: 3,
            ccreate: 4,
            overhead: 5,
            breakdown: HashMap::from([("SessionStart:startup".to_string(), 5)]),
            turns: vec![[1, 3, 4, 2]],
            mcp_calls: HashMap::from([("vercel".to_string(), 3)]),
            model_usage: HashMap::from([("claude-opus-4-8".to_string(), [1, 3, 4, 2])]),
            model: Some("claude-opus-4-8".to_string()),
            ..Default::default()
        };
        // Live report (ended_at = None) → server stamps now(); no extra key leaks.
        let body = telemetry_body("sess", "tokenmoth", &p, None, &["vercel".to_string()]);
        let obj = body.as_object().unwrap();

        // Exact field whitelist — nothing that could carry transcript / hook text.
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "baseline_tokens",
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "hook_overhead_breakdown",
                "hook_overhead_tokens",
                "input_tokens",
                "mcp_calls",
                "mcp_servers",
                "model",
                "model_usage",
                "output_tokens",
                "project_path",
                "repo",
                "session_id",
                "turn_count",
                "turn_usage",
            ]
        );
        // project_path must be the basename, never an absolute path.
        assert_eq!(obj["project_path"], json!("tokenmoth"));
        assert!(!obj["project_path"].as_str().unwrap().contains('/'));
        // mcp_servers carries only names — no path separators.
        assert_eq!(obj["mcp_servers"], json!(["vercel"]));
        // mcp_calls carries only {server: count} — numbers, no tool names/inputs.
        assert_eq!(obj["mcp_calls"], json!({"vercel": 3}));
        // model_usage carries only {model: [counts]} — numbers + model ids, no content.
        assert_eq!(obj["model_usage"], json!({"claude-opus-4-8": [1, 3, 4, 2]}));
        // baseline = first turn's input + cache_read + cache_creation.
        assert_eq!(obj["baseline_tokens"], json!(8));
        assert_eq!(obj["turn_count"], json!(1));
        // turn_usage is pure numbers: [[input, cache_read, cache_creation, output]].
        assert_eq!(obj["turn_usage"], json!([[1, 3, 4, 2]]));
    }

    #[test]
    fn backfill_body_carries_ended_at() {
        let p = Parsed { input: 1, ..Default::default() };
        let body = telemetry_body("sess", "repo", &p, Some("2026-06-09T12:00:00Z"), &[]);
        assert_eq!(body["ended_at"], json!("2026-06-09T12:00:00Z"));
    }

    #[test]
    fn parse_transcript_captures_session_meta_for_backfill() {
        let t = concat!(
            r#"{"sessionId":"abc-123","cwd":"/Users/x/proj","timestamp":"2026-06-09T10:00:00Z","message":{"usage":{"input_tokens":5}}}"#,
            "\n",
            r#"{"sessionId":"abc-123","cwd":"/Users/x/proj","timestamp":"2026-06-09T10:05:00Z","message":{"usage":{"output_tokens":7}}}"#,
        );
        let p = parse_transcript(t, &PluginResolver::default());
        assert_eq!(p.session_id.as_deref(), Some("abc-123"));
        assert_eq!(p.cwd_counts.get("/Users/x/proj"), Some(&2)); // counted per line
        assert_eq!(p.last_ts.as_deref(), Some("2026-06-09T10:05:00Z")); // last wins
    }

    #[test]
    fn model_ignores_synthetic_pseudo_model() {
        // A real model turn, then a trailing <synthetic> turn — the session must
        // keep the real model, not be relabeled synthetic (#108).
        let t = concat!(
            r#"{"message":{"model":"claude-opus-4-8","usage":{"input_tokens":10}}}"#,
            "\n",
            r#"{"message":{"model":"<synthetic>","usage":{"output_tokens":0}}}"#,
        );
        let p = parse_transcript(t, &PluginResolver::default());
        assert_eq!(p.model.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn resolve_repo_falls_back_to_dominant_cwd_basename() {
        // No path here is a real git repo, so resolution falls through to the
        // basename of the most-frequent transcript cwd (#109 fallback path).
        let mut counts = HashMap::new();
        counts.insert("/no/such/illumine".to_string(), 50);
        counts.insert("/no/such/home".to_string(), 3);
        assert_eq!(resolve_repo(None, &counts), "illumine");
        // A non-repo hook cwd doesn't win over the dominant transcript cwd.
        assert_eq!(resolve_repo(Some("/no/such/home"), &counts), "illumine");
    }
}
