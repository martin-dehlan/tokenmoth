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
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;

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
}

fn main() {
    let cli = Cli::parse();
    let r = match &cli.cmd {
        Cmd::Setup { key, api_url, local } => cmd_setup(key, api_url, *local),
        Cmd::Uninstall { local } => cmd_uninstall(*local),
        Cmd::Report { key, api_url, detach } => cmd_report(key, api_url, *detach),
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
    // tokens processed (incl. repeated cache reads). `model` = last seen.
    let p = parse_transcript(&content);

    let repo = git_repo_name(&cwd).unwrap_or_else(|| repo_from_path(&cwd));
    let body = telemetry_body(&session_id, &repo, &p);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;
    // Fire-and-forget: a failed POST must never surface to the user's session.
    let _ = client
        .post(format!("{}/v1/telemetry", api_url.trim_end_matches('/')))
        .bearer_auth(key)
        .json(&body)
        .send();
    Ok(())
}

/// Build the telemetry payload. PRIVACY INVARIANT: this is the ONLY data that
/// leaves the machine — token counts, the model name, the repo *basename*, and
/// per-hook *names* + counts. Never the absolute path, the transcript, or any
/// hook/chat content (a stray `.env` pasted into a session must never escape).
/// Keep this whitelist tight; `telemetry_body_only_whitelisted_fields` enforces it.
fn telemetry_body(session_id: &str, repo: &str, p: &Parsed) -> Value {
    json!({
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
    })
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
    model: Option<String>,
}

/// Sum per-message `usage` across a transcript JSONL, plus estimate hook/plugin
/// overhead from `attachment` entries that carry a `hookEvent` + injected
/// `content` (SessionStart plugins, MCP context, PreToolUse hooks, …), attributed
/// per `hookName`. Token estimate ≈ content length / 4.
fn parse_transcript(content: &str) -> Parsed {
    let mut p = Parsed::default();
    for line in content.lines() {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let msg = v.get("message");
        if let Some(u) = msg.and_then(|m| m.get("usage")) {
            p.input += as_i64(u, "input_tokens");
            p.output += as_i64(u, "output_tokens");
            p.cread += as_i64(u, "cache_read_input_tokens");
            p.ccreate += as_i64(u, "cache_creation_input_tokens");
        }
        if let Some(m) = msg.and_then(|m| m.get("model")).and_then(|x| x.as_str()) {
            p.model = Some(m.to_string());
        }
        // Hook/plugin context injected on a lifecycle event lives under
        // `attachment` (hook_success / hook_additional_context), carrying
        // `hookEvent` + `hookName` + the injected `content`.
        if let Some(a) = v.get("attachment") {
            if a.get("hookEvent").is_some() {
                if let Some(c) = a.get("content").and_then(|x| x.as_str()) {
                    let tok = (hook_content_len(c) / 4) as i64;
                    p.overhead += tok;
                    let name = a
                        .get("hookName")
                        .and_then(|x| x.as_str())
                        .or_else(|| a.get("hookEvent").and_then(|x| x.as_str()))
                        .unwrap_or("unknown")
                        .to_string();
                    *p.breakdown.entry(name).or_insert(0) += tok;
                }
            }
        }
    }
    p
}

fn as_i64(u: &Value, k: &str) -> i64 {
    u.get(k).and_then(|x| x.as_i64()).unwrap_or(0)
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

#[cfg(test)]
mod tests {
    use super::*;

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
        let p = parse_transcript(t);
        assert_eq!((p.input, p.output, p.cread, p.ccreate), (150, 280, 15, 3));
        assert_eq!(p.overhead, 2);
        assert_eq!(p.breakdown.get("caveman"), Some(&2));
        assert_eq!(p.model.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn parse_transcript_ignores_garbage_lines() {
        let p = parse_transcript("not json\n{}\n");
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
        assert_eq!(repo_from_path("/a/b/sample/"), "sample");
        assert_eq!(repo_from_path("/a/b/sample"), "sample");
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
    fn telemetry_body_only_whitelisted_fields_no_absolute_path() {
        let p = Parsed {
            input: 1,
            output: 2,
            cread: 3,
            ccreate: 4,
            overhead: 5,
            breakdown: HashMap::from([("SessionStart:startup".to_string(), 5)]),
            model: Some("claude-opus-4-8".to_string()),
        };
        let body = telemetry_body("sess", "tokenmoth", &p);
        let obj = body.as_object().unwrap();

        // Exact field whitelist — nothing that could carry transcript / hook text.
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "cache_creation_input_tokens",
                "cache_read_input_tokens",
                "hook_overhead_breakdown",
                "hook_overhead_tokens",
                "input_tokens",
                "model",
                "output_tokens",
                "project_path",
                "repo",
                "session_id",
            ]
        );
        // project_path must be the basename, never an absolute path.
        assert_eq!(obj["project_path"], json!("tokenmoth"));
        assert!(!obj["project_path"].as_str().unwrap().contains('/'));
    }
}
