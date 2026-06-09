import TopRail from "@/components/TopRail";
import SessionList from "@/components/SessionList";
import { fetchSessions, fmtTokens } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WINDOWS = ["1h", "5h", "12h", "24h", "7d", "30d", "90d", "all"];

export default async function Sessions({
  searchParams,
}: {
  searchParams: { since?: string };
}) {
  const since = WINDOWS.includes(searchParams.since ?? "") ? searchParams.since! : "30d";
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessions = await fetchSessions(session?.access_token ?? "", since);
  const totalOverhead = sessions.reduce((a, s) => a + s.hookOverheadTokens, 0);

  return (
    <>
      <TopRail active="sessions" since={since} />
      <main className="mx-auto max-w-4xl px-5">
        <div className="my-7 rounded-surface border border-line bg-surface shadow-surface overflow-hidden">
          <section className="px-8 pt-8 pb-7">
            <div className="text-[10px] uppercase tracking-label text-faint mb-1">sessions</div>
            <h1 className="text-2xl font-medium tracking-hero text-ink mb-1">Recent sessions</h1>
            <p className="text-[12px] text-muted mb-6">
              Per-session hook/plugin overhead — which plugins &amp; MCP injections cost what.{" "}
              {fmtTokens(totalOverhead)} overhead tok in this window.
            </p>
            <SessionList sessions={sessions} />
          </section>
        </div>
      </main>
    </>
  );
}
