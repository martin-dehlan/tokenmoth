import type { Metadata } from "next";
import Link from "next/link";
import MothLogo from "@/components/MothLogo";

export const metadata: Metadata = {
  title: "What leaves your machine — TokenMoth",
  description:
    "Exactly what the TokenMoth CLI sends, what never leaves your machine, and how to self-host.",
  robots: { index: true, follow: true },
};

// Single source of truth for this page: telemetry_body() in
// backend/crates/cli/src/main.rs. If a field is added there, add it here.
const SENT: { field: string; note: string }[] = [
  { field: "session id", note: "random id of the Claude Code session — used to de-duplicate" },
  { field: "repo name", note: "basename only, e.g. \"tokenmoth\" — never the absolute path" },
  { field: "model names", note: "which Claude models the session used" },
  { field: "token counts", note: "input, output, cache read, cache creation — plain integers" },
  { field: "hook overhead", note: "total + per-hook token cost; includes hook/plugin names" },
  { field: "MCP servers", note: "server names + call counts; no arguments, no results" },
  { field: "turn series", note: "token counts per turn (downsampled) — powers the session chart" },
  { field: "end time", note: "when the session ended" },
];

const NEVER = [
  "transcript content — prompts, completions, thinking",
  "your code, diffs or file contents",
  "file paths, directory names, usernames",
  "git remotes, branches, commit messages",
  "environment variables or credentials",
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="px-4 sm:px-8 py-7 border-t border-hair first:border-t-0">
      <div className="text-[10px] uppercase tracking-label text-faint mb-4">{label}</div>
      {children}
    </section>
  );
}

export default function DataPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-stone">
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
            <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
            <span className="font-mono text-[12px] text-faint">/data</span>
          </Link>
          <Link href="/" className="text-[13px] text-muted hover:text-ink transition-colors">
            dashboard →
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="mx-auto w-full max-w-2xl rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <Section label="privacy, for developers">
            <h1 className="text-ink tracking-hero font-medium text-[28px] sm:text-[32px] leading-[1.1]">
              What leaves your machine
            </h1>
            <p className="mt-3 text-[13px] text-muted max-w-lg leading-relaxed">
              The TokenMoth CLI parses your Claude Code session transcripts <em>locally</em> and
              sends one aggregated usage summary per session. The transcript itself never leaves
              your machine. This page lists every field — it&apos;s the dev-readable version of the{" "}
              <Link href="/en/datenschutz" className="underline hover:text-ink">
                privacy policy
              </Link>
              .
            </p>
          </Section>

          <Section label="sent — one summary per session">
            <table className="w-full text-[13px] leading-relaxed">
              <tbody>
                {SENT.map((r) => (
                  <tr key={r.field} className="border-t border-hair first:border-t-0 align-top">
                    <td className="py-2 pr-4 font-mono text-[12px] text-ink whitespace-nowrap">
                      {r.field}
                    </td>
                    <td className="py-2 text-muted">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section label="never sent">
            <ul className="space-y-1.5 text-[13px] text-muted leading-relaxed">
              {NEVER.map((line) => (
                <li key={line} className="flex gap-2.5">
                  <span aria-hidden className="text-faint select-none">
                    ✕
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[12px] text-faint leading-relaxed max-w-lg">
              Enforced in code, not just promised: the payload is built by a single whitelist
              function, and a unit test
              (<span className="font-mono">telemetry_body_only_whitelisted_fields_no_absolute_path</span>)
              fails the build if a field is added or an absolute path slips through.
            </p>
          </Section>

          <Section label="the honest caveat">
            <p className="text-[13px] text-muted leading-relaxed max-w-lg">
              A repo <em>basename</em>, hook or MCP server name can itself be sensitive — for
              example when a folder is named after a client. If that applies to you, rename the
              folder, or skip our servers entirely:
            </p>
          </Section>

          <Section label="self-host — the zero-trust option">
            <p className="text-[13px] text-muted leading-relaxed max-w-lg">
              The whole stack (API + Postgres) runs locally with <span className="font-mono text-[12px]">docker compose up</span>,
              and the CLI points anywhere:
            </p>
            <pre className="mt-3 font-mono text-[12px] leading-[1.7] text-ink whitespace-pre-wrap break-all border border-line rounded-btn bg-canvas px-4 py-3 m-0 shadow-track">
              <span className="block">
                <span className="text-faint select-none">$ </span>tokenmoth setup --key &lt;key&gt;
                --api-url http://localhost:8080
              </span>
            </pre>
            <p className="mt-3 text-[12px] text-faint leading-relaxed">
              Nothing reaches tokenmoth.com. Remove the hook anytime with{" "}
              <span className="font-mono">tokenmoth uninstall</span>.
            </p>
          </Section>

          <Section label="deletion">
            <p className="text-[13px] text-muted leading-relaxed max-w-lg">
              Settings → danger zone deletes your account and all usage data permanently (GDPR
              Art. 17). No soft delete, no retention window.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}
