"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Account data export + deletion (GDPR Art. 15/20 + Art. 17, #116).
export default function DangerZone() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/account", { method: "DELETE" });
      if (r.status !== 204) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Deletion failed (${r.status})`);
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Deletion failed");
      setBusy(false);
    }
  }

  // "LÖSCHEN" is still accepted for users who saw the old German prompt.
  const token = confirm.trim().toUpperCase();
  const armed = token === "DELETE" || token === "LÖSCHEN";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-[12px] font-medium text-ink mb-1">Export your data</h3>
        <p className="text-[12px] text-muted mb-3">
          Download all recorded sessions as CSV or JSON (right of access &amp; data portability,
          GDPR Art. 15/20).
        </p>
        <div className="flex gap-2">
          <a href="/api/export?format=csv&since=all" download className="btn text-muted">
            Export CSV
          </a>
          <a href="/api/export?format=json&since=all" download className="btn text-muted">
            Export JSON
          </a>
        </div>
      </div>

      <div className="border-t border-hair pt-5">
        <h3 className="text-[12px] font-medium text-warn mb-1">Delete account</h3>
        <p className="text-[12px] text-muted mb-3">
          Permanently deletes your account and all associated usage data (GDPR Art. 17). Type{" "}
          <span className="font-mono text-ink">DELETE</span> to confirm.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            className="rounded-btn border border-line bg-canvas px-3 py-1.5 text-[12px] text-ink font-mono w-36 outline-none focus:border-warn"
          />
          <button
            onClick={deleteAccount}
            disabled={!armed || busy}
            className="btn disabled:opacity-50"
            style={armed && !busy ? { background: "var(--warn)", borderColor: "var(--warn)", color: "#fff" } : undefined}
          >
            {busy ? "deleting…" : "Delete account permanently"}
          </button>
        </div>
        {err && <p className="mt-2 text-[11px] text-warn">{err}</p>}
      </div>
    </div>
  );
}
