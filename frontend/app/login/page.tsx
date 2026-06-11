"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import MothLogo from "@/components/MothLogo";
import { createClient } from "@/lib/supabase/client";

// Map callback error codes (and raw Supabase messages) to friendly copy. The
// OAuth callback redirects here with ?error=… on failure; without this the user
// would land on a blank login page with no explanation.
function callbackError(raw: string | null): string | null {
  if (!raw) return null;
  if (raw === "missing_code") return "Sign-in didn't complete. Please try again.";
  return "Sign-in failed. Please try again.";
}

function LoginCard() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const params = useSearchParams();
  const callbackErr = callbackError(params.get("error"));

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

  // The live sign-in error takes precedence over a stale callback param.
  const shown = err ?? callbackErr;

  return (
    <main className="min-h-dvh flex items-center justify-center px-5">
      <div className="rounded-surface border border-line bg-surface shadow-surface px-4 sm:px-8 py-10 w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <MothLogo className="h-7 w-auto text-ink" />
        </div>
        <h1 className="text-xl font-medium tracking-hero text-ink mb-1">Sign in</h1>
        <p className="text-[12px] text-muted mb-7">Track your Claude Code token usage.</p>

        <button onClick={signIn} disabled={busy} className="btn w-full justify-center py-2.5">
          {busy ? "redirecting…" : "Sign in with Google"}
        </button>

        {shown && (
          <p className="mt-4 text-[11px] text-warn" role="alert">
            {shown}
          </p>
        )}
      </div>
    </main>
  );
}

export default function Login() {
  // useSearchParams() needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
