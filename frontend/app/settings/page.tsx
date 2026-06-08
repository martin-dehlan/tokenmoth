import TopRail from "@/components/TopRail";
import KeyManager from "@/components/KeyManager";

export const dynamic = "force-dynamic";

export default function Settings() {
  return (
    <>
      <TopRail active="settings" since="30d" />
      <main className="mx-auto max-w-3xl px-5">
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-8 pt-8 pb-7">
            <div className="text-[10px] uppercase tracking-label text-faint mb-1">settings</div>
            <h1 className="text-2xl font-medium tracking-hero text-ink mb-1">API keys</h1>
            <p className="text-[12px] text-muted mb-6">
              Ingestion keys for the Claude Code hook. Create one per machine; revoke to cut a key
              off immediately.
            </p>
            <KeyManager />
          </section>
        </div>
        <footer className="pb-10 text-[11px] text-faint">
          keys are managed via an admin-gated proxy · the secret is shown only once
        </footer>
      </main>
    </>
  );
}
