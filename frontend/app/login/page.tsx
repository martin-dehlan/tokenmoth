"use client";

import { useState } from "react";
import MothLogo from "@/components/MothLogo";
import { createClient } from "@/lib/supabase/client";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="rounded-surface border border-line bg-surface shadow-surface px-8 py-10 w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
          <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
        </div>
        <h1 className="text-xl font-medium tracking-hero text-ink mb-1">Sign in</h1>
        <p className="text-[12px] text-muted mb-7">Track your Claude Code token usage.</p>

        <button onClick={signIn} disabled={busy} className="btn w-full justify-center py-2.5">
          {busy ? "redirecting…" : "Sign in with Google"}
        </button>

        {err && <p className="mt-4 text-[11px] text-warn">{err}</p>}
      </div>
    </main>
  );
}
