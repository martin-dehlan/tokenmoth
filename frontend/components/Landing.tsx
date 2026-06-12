"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import MothLogo from "@/components/MothLogo";
import OsSelect from "@/components/OsSelect";
import MethodSelect from "@/components/MethodSelect";
import ThemeToggle from "@/components/ThemeToggle";
import { detectOs, installSequence, methodNote, type Method, type Os } from "@/lib/install";
import { createClient } from "@/lib/supabase/client";
import { readConsent } from "@/lib/consent";

const PH = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Teaser setup args shown to guests — the real key is filled in on /onboarding.
const SETUP_TEASER = "--key ••••••••••••••••";

export default function Landing() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("npm");
  const [os, setOs] = useState<Os>("macos");

  // Guess the visitor's OS after mount (keeps SSR output stable).
  useEffect(() => {
    const guess = detectOs();
    if (guess) setOs(guess);
  }, []);

  // The desk is bg-stone; extend it to the body so the (transparent) global
  // footer below this full-height view sits on the same color, not on canvas.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "var(--stone)";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  const preview = installSequence(method, os, SETUP_TEASER);
  const note = methodNote(method, os);

  // Click 1: sign in. After OAuth we land on /onboarding, which generates the
  // key and shows the copy-ready command (clicks 2 + 3 happen there).
  async function getKey(provider: "github" | "google") {
    setBusy(true);
    setErr(null);
    if (PH && readConsent() === "granted")
      posthog.capture("landing_get_key_clicked", { provider });
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-stone">
      {/* top rail — same language as the dashboard TopRail */}
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
            <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
            <span className="font-mono text-[12px] text-faint">/personal</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle variant="icon" />
            <Link href="/login" className="text-[13px] text-muted hover:text-ink transition-colors">
              sign in
            </Link>
          </div>
        </div>
      </header>

      {/* the white instrument panel, floating on the stone desk */}
      <main className="flex-1 grid place-items-center px-6">
        <div className="w-full max-w-2xl rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-4 sm:px-8 pt-8 pb-7">
            <div className="text-[10px] uppercase tracking-label text-faint mb-3">
              claude code · token tracker
            </div>
            <h1 className="font-mono font-medium text-ink tracking-hero text-[30px] sm:text-[38px] leading-[1.08]">
              See what Claude Code really costs you.
            </h1>
            <p className="mt-4 text-[13px] text-muted max-w-md leading-relaxed">
              Track tokens, API-equivalent cost and plugin overhead across every repo —
              automatically, from one install command.
            </p>
          </section>

          <section className="px-4 sm:px-8 pt-6 pb-8 border-t border-hair">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="text-[10px] uppercase tracking-label text-muted">install</div>
              <div className="flex items-center gap-2">
                {method === "script" && <OsSelect current={os} onSelect={setOs} />}
                <MethodSelect current={method} onSelect={setMethod} />
              </div>
            </div>
            <pre className="font-mono text-[12px] leading-[1.7] text-ink whitespace-pre-wrap break-all border border-line rounded-btn bg-canvas px-4 py-3 m-0 shadow-track">
              {preview.map((line, i) => (
                <span key={i} className="block">
                  <span className="text-faint select-none">$ </span>
                  {line}
                </span>
              ))}
            </pre>
            {note && <p className="mt-2 text-[10px] text-faint leading-relaxed">{note}</p>}

            <div className="mt-6 flex items-center gap-4 flex-wrap">
              <button
                onClick={() => getKey("github")}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-btn bg-ink px-5 py-2.5 text-[14px] font-medium text-canvas shadow-btn transition-opacity hover:opacity-90 active:translate-y-px disabled:opacity-60"
              >
                {busy ? "redirecting…" : "Get your key with GitHub"}
                <span aria-hidden>→</span>
              </button>
              <button
                onClick={() => getKey("google")}
                disabled={busy}
                className="text-[12px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink transition-colors disabled:opacity-60"
              >
                or use Google
              </button>
              <Link
                href="/data"
                className="text-[10px] text-faint underline decoration-dotted underline-offset-2 hover:text-muted transition-colors"
              >
                transcripts stay local — see exactly what&apos;s sent →
              </Link>
            </div>

            {err && <p className="mt-3 text-[11px] text-warn">{err}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
