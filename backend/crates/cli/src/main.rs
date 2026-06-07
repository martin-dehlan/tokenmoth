//! tokenrat-cli — installs the Claude Code hook and reports session token usage.
//!
//! Subcommands:
//!   * `tokenrat setup --key tf_...`  — deep-merges a SessionEnd hook into
//!     ~/.claude/settings.json (or ./.claude with --local), preserving every
//!     existing setting. The installed hook runs `report --detach`.
//!   * `tokenrat uninstall`           — removes only tokenrat's hook entry.
//!   * `tokenrat report --key tf_...` — invoked BY the hook. Reads the hook JSON
//!     from stdin, aggregates per-message `usage` from the session transcript
//!     (the hook payload itself carries no token counts — audit finding 1),
//!     derives the git repo name, and POSTs the aggregate. With `--detach` it
//!     re-spawns itself in the background and returns instantly so SessionEnd
//!     never blocks (audit finding 2).

use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::PathBuf;

const DEFAULT_API: &str = "https://api.tokenrat.dev";

#[derive(Parser)]
#[command(name = "tokenrat", version, about = "tokenrat — Claude Code token & cost tracker")]
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
    /// Remove tokenrat's SessionEnd hook (leaves all other settings untouched).
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
        eprintln!("tokenrat: {e}");
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
    let command = format!("tokenrat report --key {key} --api-url {api_url} --detach");

    if install_hook(&mut root, &command)? {
        println!("tokenrat hook already installed in {}", path.display());
        return Ok(());
    }
    write_settings(&path, &root)?;
    println!("✓ tokenrat hook installed → {}", path.display());
    println!("  Repo name is auto-detected per project at session end.");
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
        println!("no tokenrat hook found in {}", path.display());
        return Ok(());
    }
    write_settings(&path, &root)?;
    println!("✓ removed tokenrat hook from {}", path.display());
    Ok(())
}

/// Deep-merge a SessionEnd command hook. Returns true if one was already present
/// (no change made). Preserves all unrelated settings.
fn install_hook(root: &mut Value, command: &str) -> anyhow::Result<bool> {
    let obj = root
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("settings root is not a JSON object"))?;
    let hooks = obj
        .entry("hooks")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .ok_or_else(|| anyhow::anyhow!("`hooks` is not an object"))?;
    let arr = hooks
        .entry("SessionEnd")
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or_else(|| anyhow::anyhow!("`hooks.SessionEnd` is not an array"))?;

    if arr.iter().any(group_has_tokenrat) {
        return Ok(true);
    }
    arr.push(json!({ "hooks": [ { "type": "command", "command": command } ] }));
    Ok(false)
}

/// Remove every SessionEnd group that runs `tokenrat report`, then tidy up empty
/// containers. Returns how many groups were removed.
fn uninstall_hook(root: &mut Value) -> usize {
    let Some(obj) = root.as_object_mut() else { return 0 };
    let Some(hooks) = obj.get_mut("hooks").and_then(|h| h.as_object_mut()) else { return 0 };
    let Some(arr) = hooks.get_mut("SessionEnd").and_then(|a| a.as_array_mut()) else { return 0 };

    let before = arr.len();
    arr.retain(|g| !group_has_tokenrat(g));
    let removed = before - arr.len();

    if arr.is_empty() {
        hooks.remove("SessionEnd");
    }
    if hooks.is_empty() {
        obj.remove("hooks");
    }
    removed
}

fn group_has_tokenrat(group: &Value) -> bool {
    group
        .get("hooks")
        .and_then(|h| h.as_array())
        .map(|hs| {
            hs.iter().any(|h| {
                h.get("command")
                    .and_then(|c| c.as_str())
                    .map(|c| c.contains("tokenrat report"))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn cmd_report(key: &str, api_url: &str, detach: bool) -> anyhow::Result<()> {
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf)?;

    if detach && std::env::var_os("TOKENRAT_DETACHED").is_none() {
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
        .env("TOKENRAT_DETACHED", "1")
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
    let (input, output, cread, ccreate, model) = parse_transcript(&content);

    let repo = git_repo_name(&cwd).unwrap_or_else(|| repo_from_path(&cwd));

    let body = json!({
        "session_id": session_id,
        "project_path": cwd,
        "repo": repo,
        "model": model,
        "input_tokens": input,
        "output_tokens": output,
        "cache_read_input_tokens": cread,
        "cache_creation_input_tokens": ccreate,
    });

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

/// Sum per-message `usage` across a transcript JSONL. Returns
/// (input, output, cache_read, cache_creation, last_model).
fn parse_transcript(content: &str) -> (i64, i64, i64, i64, Option<String>) {
    let (mut input, mut output, mut cread, mut ccreate) = (0i64, 0i64, 0i64, 0i64);
    let mut model = None;
    for line in content.lines() {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let msg = v.get("message");
        if let Some(u) = msg.and_then(|m| m.get("usage")) {
            input += as_i64(u, "input_tokens");
            output += as_i64(u, "output_tokens");
            cread += as_i64(u, "cache_read_input_tokens");
            ccreate += as_i64(u, "cache_creation_input_tokens");
        }
        if let Some(m) = msg.and_then(|m| m.get("model")).and_then(|x| x.as_str()) {
            model = Some(m.to_string());
        }
    }
    (input, output, cread, ccreate, model)
}

fn as_i64(u: &Value, k: &str) -> i64 {
    u.get(k).and_then(|x| x.as_i64()).unwrap_or(0)
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
        );
        let (i, o, cr, cc, m) = parse_transcript(t);
        assert_eq!((i, o, cr, cc), (150, 280, 15, 3));
        assert_eq!(m.as_deref(), Some("claude-opus-4-8"));
    }

    #[test]
    fn parse_transcript_ignores_garbage_lines() {
        let (i, o, cr, cc, m) = parse_transcript("not json\n{}\n");
        assert_eq!((i, o, cr, cc), (0, 0, 0, 0));
        assert_eq!(m, None);
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
        let cmd = "tokenrat report --key k --api-url u --detach";
        assert_eq!(install_hook(&mut root, cmd).unwrap(), false); // installed
        assert_eq!(install_hook(&mut root, cmd).unwrap(), true); // idempotent no-op
        assert!(root["hooks"]["PreToolUse"].is_array()); // preserved
        assert_eq!(root["hooks"]["SessionEnd"].as_array().unwrap().len(), 1);
        assert_eq!(root["model"], "opus");
    }

    #[test]
    fn uninstall_removes_only_tokenrat_and_tidies() {
        let mut root = json!({
            "hooks": {
                "PreToolUse": [
                    { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo keep" } ] }
                ],
                "SessionEnd": [
                    { "hooks": [ { "type": "command", "command": "tokenrat report --key k --detach" } ] }
                ]
            }
        });
        assert_eq!(uninstall_hook(&mut root), 1);
        assert!(root["hooks"]["PreToolUse"].is_array()); // kept
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
}
