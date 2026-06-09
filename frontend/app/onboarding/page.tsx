import Link from "next/link";
import MothLogo from "@/components/MothLogo";
import OnboardingFlow from "@/components/OnboardingFlow";

export const dynamic = "force-dynamic";

export default function Onboarding() {
  return (
    <div className="min-h-screen flex flex-col bg-stone">
      {/* slim rail — same language as the landing */}
      <header className="shrink-0 border-b border-line">
        <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <MothLogo className="h-[22px] w-auto text-ink shrink-0" />
            <span className="text-[15px] font-medium tracking-hero text-ink">TokenMoth</span>
            <span className="font-mono text-[12px] text-faint">/personal</span>
          </div>
          <Link href="/" className="text-[13px] text-muted hover:text-ink transition-colors">
            dashboard →
          </Link>
        </div>
      </header>

      <main className="flex-1 grid place-items-center px-6 py-10">
        <div className="w-full max-w-2xl rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-8 pt-8 pb-8">
            <div className="text-[10px] uppercase tracking-label text-faint mb-3">get started</div>
            <h1 className="text-ink tracking-hero font-medium text-[28px] sm:text-[32px] leading-[1.1]">
              Track your Claude Code usage
            </h1>
            <p className="mt-3 text-[13px] text-muted max-w-md leading-relaxed">
              Two steps — install the CLI, then just keep coding. Your tokens show up here
              automatically.
            </p>
            <div className="mt-7">
              <OnboardingFlow />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
