// Annotated line chart drawn from the inside: y-values float on the gridlines,
// line names sit at each line's end, the peak gets a dashed callout, and the
// main line carries a live endpoint dot. No legend box.

export type ChartSeries = {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
};

export default function AnnotatedChart({
  series,
  xLabels,
  format,
  height = 240,
}: {
  series: ChartSeries[];
  xLabels: string[];
  format: (n: number) => string;
  height?: number;
}) {
  const W = 1000;
  const H = height;
  const padL = 18;
  const padR = 120; // increased to give more room for end-of-line labels and prevent cropping
  const padT = 24;
  const padB = 14;
  const n = xLabels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * innerH;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const main = series[0];

  let spikeI = 0;
  if (main) main.values.forEach((v, i) => (v > main.values[spikeI] ? (spikeI = i) : null));

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  // End-of-line labels collide when several series finish at the same y (e.g.
  // total/input/output all near 0 in the last bucket). Spread them vertically
  // with a minimum gap, keeping value order, and nudge the stack up if it would
  // overflow the bottom.
  const LABEL_GAP = 13;
  const endLabelY: number[] = (() => {
    const items = series.map((s, si) => ({ si, yRaw: y(s.values[n - 1] ?? 0) + 3 }));
    items.sort((a, b) => a.yRaw - b.yRaw);
    const out: number[] = [];
    let prev = -Infinity;
    for (const it of items) {
      const yy = Math.max(it.yRaw, prev + LABEL_GAP);
      out[it.si] = yy;
      prev = yy;
    }
    const bottom = H - 4;
    const overflow = Math.max(0, ...out) - bottom;
    if (overflow > 0) for (let i = 0; i < out.length; i++) out[i] -= overflow;
    return out;
  })();

  const areaPath =
    main && n > 1
      ? `${linePath(main.values)} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(
          1,
        )} ${y(0).toFixed(1)} Z`
      : "";

  // sample x labels to avoid crowding
  const step = Math.max(1, Math.ceil(n / 9));
  const shown = xLabels.filter((_, i) => i % step === 0 || i === n - 1);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
      >
        {/* gridlines + floating y labels */}
        {grid.map((gv, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} stroke="#ececee" strokeWidth={0.5} />
            <text
              x={padL + 2}
              y={y(gv) - 3}
              fontSize={10}
              fill="#9ca3af"
              fontFamily="var(--font-mono), monospace"
            >
              {format(gv)}
            </text>
          </g>
        ))}

        {/* area under main line */}
        {areaPath && <path d={areaPath} fill="rgba(26,127,100,0.05)" stroke="none" />}

        {/* peak callout — skip when the window is entirely empty (no "peak 0") */}
        {main && n > 1 && main.values[spikeI] > 0 && (
          <g>
            <line
              x1={x(spikeI)}
              x2={x(spikeI)}
              y1={y(main.values[spikeI])}
              y2={H - padB}
              stroke="#9ca3af"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
            <text x={x(spikeI) + 4} y={y(main.values[spikeI]) - 7} fontSize={10} fill="#6b7280">
              peak {format(main.values[spikeI])}
            </text>
          </g>
        )}

        {/* lines + end labels + live dot */}
        {series.map((s, si) => (
          <g key={s.name}>
            <path
              d={linePath(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={si === 0 ? 2.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? "4 4" : undefined}
              opacity={si === 0 ? 1 : 0.6}
            />
            <text
              x={x(n - 1) + 6}
              y={endLabelY[si]}
              fontSize={9}
              fontFamily="var(--font-mono), monospace"
              fontWeight={600}
              letterSpacing={0.6}
              fill={s.color}
              opacity={si === 0 ? 1 : 0.9}
            >
              {s.name.toUpperCase()}
            </text>
            {si === 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} />}
          </g>
        ))}
      </svg>

      {/* x axis */}
      <div className="flex justify-between mt-1.5 px-[18px]">
        {shown.map((l, i) => (
          <span key={i} className="font-mono text-[10px] text-faint">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
