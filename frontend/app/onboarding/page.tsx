import TopRail from "@/components/TopRail";
import OnboardingFlow from "@/components/OnboardingFlow";

export const dynamic = "force-dynamic";

export default function Onboarding() {
  return (
    <>
      <TopRail active="usage" since="30d" />
      <main className="mx-auto max-w-3xl px-5">
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-8 pt-8 pb-8">
            <div className="text-[10px] uppercase tracking-label text-faint mb-1">get started</div>
            <h1 className="text-2xl font-medium tracking-hero text-ink mb-1">
              Track your Claude Code usage
            </h1>
            <p className="text-[12px] text-muted mb-7">
              Two steps — install the CLI, then just use Claude Code. Your tokens show up here
              automatically.
            </p>
            <OnboardingFlow />
          </section>
        </div>
      </main>
    </>
  );
}
