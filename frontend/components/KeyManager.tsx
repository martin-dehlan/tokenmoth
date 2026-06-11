"use client";

import { useCallback, useEffect, useState } from "react";
import BackfillCommand from "@/components/BackfillCommand";

type Key = {
  id: string;
  masked: string;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
  active: boolean;
};
type Created = { id: string; key: string; label: string | null };

const SETUP_API_URL = process.env.NEXT_PUBLIC_TOKENMOTH_API_URL ?? "http://localhost:8080";
const INSTALL_CMD = "curl -fsSL https://tokenmoth-dist.s3.eu-central-1.amazonaws.com/install.sh | sh";

export default function KeyManager() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<Created | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/keys", { cache: "no-store" });
    if (r.ok) {
      setKeys(await r.json());
      setErr(null);
    } else {
      setErr(`${r.status}: ${await r.text()}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: label.trim() || null }),
    });
    if (r.ok) {
      setCreated(await r.json());
      setLabel("");
      load();
    } else {
      setErr(`${r.status}: ${await r.text()}`);
    }
  }

  async function revoke(id: string) {
    const r = await fetch(`/api/keys/${id}/revoke`, { method: "POST" });
    if (r.ok || r.status === 204) load();
    else setErr(`${r.status}: ${await r.text()}`);
  }

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const setupCmd = created
    ? `${INSTALL_CMD}\ntokenmoth setup --key ${created.key} --api-url ${SETUP_API_URL}`
    : "";

  return (
    <div className="flex flex-col gap-6">
      {err && (
        <div className="text-[11px] text-warn flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-warn inline-block" />
          {err}
        </div>
      )}

      {/* create */}
      <form onSubmit={create} className="flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (e.g. laptop)"
          className="border border-line rounded-btn px-3 py-1.5 text-[13px] shadow-btn focus:outline-none focus:border-accent bg-surface"
        />
        <button type="submit" className="btn btn-accent">
          + new key
        </button>
      </form>

      {/* show-once reveal */}
      {created && (
        <div className="border border-accent rounded-btn bg-accent-faint p-4 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-label text-accent">
            new key — copy it now, it won't be shown again
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-[13px] text-ink break-all">{created.key}</code>
            <button className="btn" onClick={() => copy(created.key, "key")}>
              {copied === "key" ? "copied ✓" : "copy key"}
            </button>
            <button className="btn" onClick={() => copy(setupCmd, "cmd")}>
              {copied === "cmd" ? "copied ✓" : "copy install + setup"}
            </button>
            <button className="btn text-muted" onClick={() => setCreated(null)}>
              done
            </button>
          </div>
          <div className="text-[10px] uppercase tracking-label text-muted pt-1">
            install the CLI, then register the hook:
          </div>
          <pre className="font-mono text-[11px] text-muted whitespace-pre-wrap break-all bg-surface border border-hair rounded-btn p-2 m-0">
            {`$ ${setupCmd.replace("\n", "\n$ ")}`}
          </pre>
          <div className="text-[10px] uppercase tracking-label text-muted pt-2">
            optional — import this machine&apos;s past sessions:
          </div>
          <BackfillCommand apiKey={created.key} apiUrl={SETUP_API_URL} method="npm" />
        </div>
      )}

      {/* list */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[1fr_1.2fr_auto_auto] gap-4 text-[10px] uppercase tracking-label text-faint pb-2 border-b border-hair">
          <span>key</span>
          <span>label</span>
          <span>created</span>
          <span className="text-right">status</span>
        </div>
        {loading ? (
          <div className="py-6 text-[12px] text-faint">loading…</div>
        ) : keys.length === 0 ? (
          <div className="py-6 text-[12px] text-faint">no keys yet</div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="grid grid-cols-[1fr_1.2fr_auto_auto] gap-4 items-center py-2.5 border-b border-hair text-[12px]"
            >
              <code className="font-mono text-ink">{k.masked}</code>
              <span className="text-muted truncate">{k.label ?? "—"}</span>
              <span className="font-mono text-faint">{k.created_at.slice(0, 10)}</span>
              <div className="flex justify-end">
                {k.active ? (
                  <button className="btn text-warn" onClick={() => revoke(k.id)}>
                    revoke
                  </button>
                ) : (
                  <span className="tag" style={{ color: "#9ca3af", background: "rgba(156,163,175,0.1)" }}>
                    revoked
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
