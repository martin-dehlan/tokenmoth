"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import OsSelect from "@/components/OsSelect";
import MethodSelect from "@/components/MethodSelect";
import { detectOs, installSequence, methodNote, type Method, type Os } from "@/lib/install";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const API_URL = process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";

// How long to wait for the first session before showing troubleshooting + an
// escape hatch to the dashboard. Polling continues in the background regardless.
const SLOW_MS = 40_000;

const NET_ERR = "Couldn't reach the server. Check your connection and try again.";

type Phase = "init" | "have-key" | "creating" | "ready" | "received";

export default function OnboardingFlow() {
  const [key, setKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("init");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const [method, setMethod] = useState<Method>("npm");
  const [os, setOs] = useState<Os>("macos");

  // Guess the visitor's OS after mount (keeps SSR output stable).
  useEffect(() => {
    const guess = detectOs();
    if (guess) setOs(guess);
  }, []);

  const createKey = useCallback(async () => {
    setPhase("creating");
    setErr(null);
    setSessionExpired(false);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "onboarding" }),
      });
      if (!r.ok) {
        // Distinguish an expired session (actionable: sign in) from other
        // failures (actionable: retry). Never surface a raw status/stack.
        if (r.status === 401) {
          setSessionExpired(true);
          setErr("Your session expired — sign in to continue.");
        } else {
          setErr("Couldn't create your key. Please try again.");
        }
        setPhase("have-key");
        return;
      }
      const d = await r.json();
      setKey(d.key);
      setPhase("ready");
      if (PH) posthog.capture("onboarding_key_created");
    } catch {
      setErr(NET_ERR);
      setPhase("have-key");
    }
  }, []);

  // On arrival: auto-generate a key if the user has none; else offer a button
  // (the existing key's secret can't be re-shown, so a fresh one is needed).
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/keys", { cache: "no-store" });
        if (r.status === 401) {
          setSessionExpired(true);
          setErr("Your session expired — sign in to continue.");
          setPhase("have-key");
          return;
        }
        const keys = r.ok ? await r.json() : [];
        const active = Array.isArray(keys) && keys.some((k: { active: boolean }) => k.active);
        if (active) {
          setHasExistingKey(true);
          setPhase("have-key");
        } else {
          createKey();
        }
      } catch {
        setErr(NET_ERR);
        setPhase("have-key");
      }
    })();
  }, [createKey]);

  // Once the command is shown, poll for the first session. After SLOW_MS,
  // reveal troubleshooting + a dashboard escape hatch (polling keeps running).
  useEffect(() => {
    if (phase !== "ready") return;
    setWaitedLong(false);
    const slow = setTimeout(() => setWaitedLong(true), SLOW_MS);
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/repos?since=all", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d.repos) && d.repos.length > 0) {
            setPhase("received");
            clearInterval(id);
          }
        }
      } catch {
        /* transient — keep polling */
      }
    }, 4000);
    return () => {
      clearInterval(id);
      clearTimeout(slow);
    };
  }, [phase]);

  const cmd = key
    ? installSequence(method, os, `--key ${key} --api-url ${API_URL}`).join("\n")
    : "";
  const note = methodNote(method, os);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setCopyFailed(false);
      if (PH) posthog.capture("onboarding_install_copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API unavailable (insecure context / old browser) — tell the
      // user to copy by hand instead of failing silently.
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* step 1 */}
      <div>
        <div className="text-[10px] uppercase tracking-label text-muted mb-2.5">
          1 · install &amp; connect — run in your terminal
        </div>

        {phase === "creating" || phase === "init" ? (
          <div className="font-mono text-[12px] text-faint">preparing your key…</div>
        ) : phase === "have-key" ? (
          sessionExpired ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-btn bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas shadow-btn transition-colors hover:opacity-90 active:translate-y-px"
            >
              Sign in to continue →
            </Link>
          ) : (
            <div className="flex flex-col items-start gap-2.5">
              {hasExistingKey && !err && (
                <p className="text-[12px] text-muted leading-relaxed max-w-md">
                  You already have a key. Generate a fresh one to see the install command — or{" "}
                  <Link href="/settings" className="underline hover:text-ink transition-colors">
                    manage your keys
                  </Link>
                  .
                </p>
              )}
              <button
                className="inline-flex items-center gap-2 rounded-btn bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas shadow-btn transition-colors hover:opacity-90 active:translate-y-px"
                onClick={createKey}
              >
                {err ? "Try again" : hasExistingKey ? "Generate a fresh command" : "Generate my install command"}
              </button>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center justify-end gap-2 mb-2.5">
              {method === "script" && <OsSelect current={os} onSelect={setOs} />}
              <MethodSelect current={method} onSelect={setMethod} />
            </div>
            <pre className="font-mono text-[12px] leading-[1.7] text-ink whitespace-pre-wrap break-all border border-line rounded-btn bg-canvas px-4 py-3 m-0 shadow-track">
              {cmd.split("\n").map((line, i) => (
                <span key={i} className="block">
                  <span className="text-faint select-none">$ </span>
                  {line}
                </span>
              ))}
            </pre>
            {note && <p className="mt-2 text-[10px] text-faint leading-relaxed">{note}</p>}
            <div className="mt-3 flex items-center gap-4 flex-wrap">
              <button
                className="inline-flex items-center gap-2 rounded-btn bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas shadow-btn transition-colors hover:opacity-90 active:translate-y-px"
                onClick={copy}
              >
                {copied ? "copied ✓" : "copy command"}
              </button>
              <span className="text-[10px] text-faint">
                your transcripts stay local — only token counts are sent
              </span>
            </div>
            {copyFailed && (
              <p className="mt-2 text-[10px] text-faint leading-relaxed" role="alert">
                Couldn&apos;t copy automatically — select the command above and press{" "}
                <kbd className="font-mono">⌘/Ctrl + C</kbd>.
              </p>
            )}
          </>
        )}

        {err && (
          <p className="mt-3 text-[11px] text-warn" role="alert">
            {err}
          </p>
        )}
      </div>

      {/* step 2 — live status */}
      {(phase === "ready" || phase === "received") && (
        <div className="border-t border-hair pt-5" aria-live="polite">
          <div className="text-[10px] uppercase tracking-label text-muted mb-3">
            2 · finish a Claude Code session
          </div>
          {phase === "ready" ? (
            <>
              <div className="flex items-center gap-2.5 text-[13px] text-muted">
                <span className="inline-block h-2 w-2 rounded-full bg-warn animate-pulse" />
                waiting for your first session…
              </div>
              {waitedLong && (
                <div className="mt-3 text-[11px] text-faint leading-relaxed max-w-md">
                  <p>
                    Nothing yet? Make sure you ran the command <strong>inside a git repo</strong> and
                    actually <strong>ended</strong> a Claude Code session (the hook fires on session
                    end). It can take a moment after the session closes.
                  </p>
                  <Link
                    href="/"
                    className="mt-2 inline-block underline hover:text-ink transition-colors"
                  >
                    Go to dashboard anyway →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] text-ink">✓ first session received!</span>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-btn bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas shadow-btn transition-colors hover:opacity-90 active:translate-y-px"
              >
                Go to dashboard →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
