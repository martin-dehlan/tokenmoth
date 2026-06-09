"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const API_URL = process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";
const INSTALL = "curl -fsSL https://tokenmoth-dist.s3.eu-central-1.amazonaws.com/install.sh | sh";

type Phase = "init" | "have-key" | "creating" | "ready" | "received";

export default function OnboardingFlow() {
  const [key, setKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("init");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createKey = useCallback(async () => {
    setPhase("creating");
    setErr(null);
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "onboarding" }),
    });
    if (r.ok) {
      const d = await r.json();
      setKey(d.key);
      setPhase("ready");
      if (PH) posthog.capture("onboarding_key_created");
    } else {
      setErr(`${r.status}: ${await r.text()}`);
      setPhase("have-key");
    }
  }, []);

  // On arrival: auto-generate a key if the user has none; else offer a button.
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/keys", { cache: "no-store" });
      const keys = r.ok ? await r.json() : [];
      const active = Array.isArray(keys) && keys.some((k: { active: boolean }) => k.active);
      if (active) setPhase("have-key");
      else createKey();
    })();
  }, [createKey]);

  // Once the command is shown, poll for the first session.
  useEffect(() => {
    if (phase !== "ready") return;
    const id = setInterval(async () => {
      const r = await fetch("/api/repos?since=all", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.repos) && d.repos.length > 0) {
          setPhase("received");
          clearInterval(id);
        }
      }
    }, 4000);
    return () => clearInterval(id);
  }, [phase]);

  const cmd = key ? `${INSTALL}\ntokenmoth setup --key ${key} --api-url ${API_URL}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      if (PH) posthog.capture("onboarding_install_copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* step 1 */}
      <div>
        <div className="text-[10px] uppercase tracking-label text-muted mb-2">
          1 · install &amp; connect — run in your terminal
        </div>

        {phase === "have-key" ? (
          <button className="btn btn-accent" onClick={createKey}>
            Generate my install command
          </button>
        ) : phase === "creating" || phase === "init" ? (
          <div className="text-[12px] text-faint">preparing your key…</div>
        ) : (
          <>
            <pre className="font-mono text-[12px] text-ink whitespace-pre-wrap break-all border border-line rounded-btn p-3 shadow-btn bg-surface m-0">
              {`$ ${cmd.replace("\n", "\n$ ")}`}
            </pre>
            <button className="btn btn-accent mt-2" onClick={copy}>
              {copied ? "copied ✓" : "copy command"}
            </button>
            <span className="text-[10px] text-faint ml-3">
              your transcripts stay local — only token counts are sent
            </span>
          </>
        )}
        {err && <p className="mt-2 text-[11px] text-warn">{err}</p>}
      </div>

      {/* step 2 — live status */}
      {(phase === "ready" || phase === "received") && (
        <div className="border-t border-hair pt-5">
          <div className="text-[10px] uppercase tracking-label text-muted mb-3">
            2 · finish a Claude Code session
          </div>
          {phase === "ready" ? (
            <div className="flex items-center gap-2.5 text-[13px] text-muted">
              <span className="inline-block h-2 w-2 rounded-full bg-warn animate-pulse" />
              waiting for your first session…
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] text-accent">✓ first session received!</span>
              <Link href="/" className="btn btn-accent">
                Go to dashboard →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
