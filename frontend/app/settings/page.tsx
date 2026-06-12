import TopRail from "@/components/TopRail";
import KeyManager from "@/components/KeyManager";
import PlanBudget from "@/components/PlanBudget";
import DangerZone from "@/components/DangerZone";

export const dynamic = "force-dynamic";

export default function Settings() {
  return (
    <>
      <TopRail active="settings" showWindow={false} />
      <main className="mx-auto max-w-3xl px-5">
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-4 sm:px-8 pt-8 pb-7">
            <div className="text-[10px] uppercase tracking-label text-faint mb-1">settings</div>
            <h1 className="text-2xl font-medium tracking-hero text-ink mb-1">API keys</h1>
            <p className="text-[12px] text-muted mb-6">
              Ingestion keys for the Claude Code hook. Create one per machine; revoke to cut a key
              off immediately.
            </p>
            <KeyManager />
          </section>

          <section className="px-4 sm:px-8 pt-6 pb-7 border-t border-hair">
            <h2 className="text-[10px] uppercase tracking-label text-muted mb-1">
              claude plan &amp; budget
            </h2>
            <p className="text-[12px] text-muted mb-4">
              How you pay for Claude decides what&apos;s worth tracking: a flat subscription gets
              the ROI view, pay-as-you-go gets a real-dollar budget. Plan choice is stored in this
              browser only.
            </p>
            <PlanBudget />
          </section>

          <section className="px-4 sm:px-8 pt-6 pb-8 border-t border-hair">
            <h2 className="text-[10px] uppercase tracking-label text-muted mb-1">data & privacy</h2>
            <p className="text-[12px] text-muted mb-4">
              Export or permanently delete your account data (DSGVO Art. 15/17/20).
            </p>
            <DangerZone />
          </section>
        </div>
        <footer className="pb-10 text-[11px] text-faint">
          keys are managed via an admin-gated proxy · the secret is shown only once
        </footer>
      </main>
    </>
  );
}
