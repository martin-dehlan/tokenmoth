"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Account data export + deletion (DSGVO Art. 15/20 + Art. 17, #116).
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
        throw new Error(body.error ?? `Löschen fehlgeschlagen (${r.status})`);
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
      setBusy(false);
    }
  }

  const armed = confirm.trim().toUpperCase() === "LÖSCHEN";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-[12px] font-medium text-ink mb-1">Deine Daten exportieren</h3>
        <p className="text-[12px] text-muted mb-3">
          Lade alle erfassten Sessions als CSV oder JSON herunter (Auskunft &
          Datenübertragbarkeit, Art. 15/20 DSGVO).
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
        <h3 className="text-[12px] font-medium text-warn mb-1">Account löschen</h3>
        <p className="text-[12px] text-muted mb-3">
          Löscht dein Konto und alle zugehörigen Nutzungsdaten unwiderruflich (Art. 17 DSGVO).
          Tippe <span className="font-mono text-ink">LÖSCHEN</span> zur Bestätigung.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="LÖSCHEN"
            className="rounded-btn border border-line bg-canvas px-3 py-1.5 text-[12px] text-ink font-mono w-36 outline-none focus:border-warn"
          />
          <button
            onClick={deleteAccount}
            disabled={!armed || busy}
            className="btn disabled:opacity-50"
            style={armed && !busy ? { background: "var(--warn)", borderColor: "var(--warn)", color: "#fff" } : undefined}
          >
            {busy ? "lösche…" : "Account endgültig löschen"}
          </button>
        </div>
        {err && <p className="mt-2 text-[11px] text-warn">{err}</p>}
      </div>
    </div>
  );
}
