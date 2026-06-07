import { SeriesPoint, breakerLoad, fmtUsd, Load } from "@/lib/data";

const BAR: Record<Load, string> = {
  low: "bg-toxic",
  mid: "bg-ratyellow",
  high: "bg-ratyellow",
  tripped: "bg-danger",
};

// Neo-brutalist daily cost bar chart — hard borders, no gradients.
export default function CostChart({ points }: { points: SeriesPoint[] }) {
  const max = Math.max(0.0001, ...points.map((p) => p.costUsd));

  return (
    <div className="border-4 border-black bg-black p-4">
      <div className="text-[11px] font-bold tracking-widest text-white/60 mb-3">
        DAILY DRAW · {points.length} DAYS
      </div>
      <div className="flex items-end gap-1 h-52">
        {points.map((p) => {
          const h = Math.max(2, Math.round((p.costUsd / max) * 100));
          const load = breakerLoad(p.costUsd);
          return (
            <div
              key={p.day}
              className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0 h-full"
              title={`${p.day} · ${fmtUsd(p.costUsd)} · ${p.sessions} session(s)`}
            >
              <span className="text-[9px] text-white/50 tabular-nums">{fmtUsd(p.costUsd)}</span>
              <div className={`w-full border-2 border-black ${BAR[load]}`} style={{ height: `${h}%` }} />
              <span className="text-[9px] text-white/40 truncate w-full text-center">
                {p.day.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
