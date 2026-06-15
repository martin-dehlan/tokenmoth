"use client";

import { useState } from "react";
import { backfillCommand, type Method } from "@/lib/install";
import CopyIconButton from "@/components/CopyIconButton";

// Copyable "import past sessions" command. The web app can't run the CLI, so —
// like the install step — it hands the user a command to paste in their
// terminal. Backfill is idempotent (the API upserts by session id), so it's
// always safe to re-run and never double-counts.
export default function BackfillCommand({
  apiKey,
  apiUrl,
  method = "npm",
}: {
  apiKey: string;
  apiUrl: string;
  method?: Method;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const cmd = backfillCommand(method, apiKey, apiUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <pre className="font-mono text-[12px] leading-[1.7] text-ink whitespace-pre-wrap break-all border border-line rounded-btn bg-canvas pl-4 pr-12 py-3 m-0 shadow-track">
          <span className="text-faint select-none">$ </span>
          {cmd}
        </pre>
        <CopyIconButton onClick={copy} copied={copied} />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button className="btn" onClick={copy}>
          {copied ? "copied ✓" : "copy command"}
        </button>
        <span className="text-[10px] text-faint leading-relaxed">
          reads local transcripts only · safe to re-run (idempotent) · add{" "}
          <code className="font-mono">--repo &lt;name&gt;</code> to import a single repo
        </span>
      </div>
      {copyFailed && (
        <p className="text-[10px] text-faint leading-relaxed" role="alert">
          Couldn&apos;t copy automatically — select the command above and press{" "}
          <kbd className="font-mono">⌘/Ctrl + C</kbd>.
        </p>
      )}
      <p className="text-[10px] text-faint leading-relaxed max-w-md">
        Run it on each machine you use Claude Code on — sessions are unique per machine, so totals
        add up without double-counting.
      </p>
    </div>
  );
}
