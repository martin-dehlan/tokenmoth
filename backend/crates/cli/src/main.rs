//! tokenrat-cli — installs the Claude Code hook and reports session token usage.
//!
//! Two subcommands:
//!   * `tokenrat setup --key tf_...`  — deep-merges a SessionEnd hook into
//!     ~/.claude/settings.json (or ./.claude/settings.json with --local),
//!     preserving every existing setting.
//!   * `tokenrat report --key tf_...` — invoked BY that hook. Reads the hook
//!     JSON from stdin, parses the session transcript for per-message `usage`
//!     (the hook payload itself has no token counts — audit finding 1),
//!     derives the git repo name, and POSTs the aggregate to the API.

use clap::{Parser, Subcommand};
use serde_json::{json, Value};
use std::io::Read;
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
        /// Your tokenrat API key (e.g. tf_user_123).
        #[arg(long)]
        key: String,
        /// API base URL.
        #[arg(long, default_value = DEFAULT_API)]
        api_url: String,
        /// Install into ./.claude/settings.json instead of ~/.claude.
        #[arg(long)]
        local: bool,
    },
    /// Invoked by the Claude Code hook: parse transcript + POST usage. Never errors out the session.
    Report {
        #[arg(long)]
        key: String,
        #[arg(long, default_value = DEFAULT_API)]
        api_url: String,
    },
}

fn main() {
    let cli = Cli::parse();
    let r = match &cli.cmd {
        Cmd::Setup { key, api_url, local } => cmd_setup(key, api_url, *local),
        Cmd::Report { key, api_url } => cmd_report(key, api_url),
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

fn cmd_setup(key: &str, api_url: &str, local: bool) -> anyhow::Result<()> {
    let path = settings_path(local)?;
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p)?;
    }

    // Load existing settings as a generic JSON value so we never drop unknown keys.
    let mut root: Value = if path.exists() {
        serde_json::from_str(&std::fs::read_to_string(&path)?)
            .map_err(|e| anyhow::anyhow!("{} is not valid JSON: {e}", path.display()))?
    } else {
        json!({})
    };

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

    // Idempotent: bail early if a tokenrat hook is already present.
    let already = arr.iter().any(|group| {
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
    });
    if already {
        println!("tokenrat hook already installed in {}", path.display());
        return Ok(());
    }

    let command = format!("tokenrat report --key {key} --api-url {api_url}");
    arr.push(json!({ "hooks": [ { "type": "command", "command": command } ] }));

    std::fs::write(&path, serde_json::to_string_pretty(&root)? + "\n")?;
    println!("✓ tokenrat hook installed → {}", path.display());
    println!("  Repo name is auto-detected per project at session end.");
    Ok(())
}

fn cmd_report(key: &str, api_url: &str) -> anyhow::Result<()> {
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf)?;
    let hook: Value = serde_json::from_str(&buf).unwrap_or_else(|_| json!({}));

    let session_id = hook.get("session_id").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    let cwd = hook.get("cwd").and_then(|v| v.as_str()).unwrap_or(".").to_string();
    let transcript_path = hook.get("transcript_path").and_then(|v| v.as_str());

    let (mut input, mut output, mut cread, mut ccreate) = (0i64, 0i64, 0i64, 0i64);
    let mut model: Option<String> = None;

    if let Some(tp) = transcript_path {
        if let Ok(content) = std::fs::read_to_string(tp) {
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
        }
    }

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
