"use client";

// Measured-width chart canvas. A ResizeObserver on the wrapper sets the SVG
// coordinate width to the container's CSS pixel width (1 SVG unit = 1 CSS px),
// so font sizes stay readable at any viewport instead of scaling down with a
// fixed 1000-unit viewBox. Height is fixed, so layout never jumps; before the
// first measurement (SSR / pre-hydration) it renders at a 720px fallback width
// scaled into the container. useLayoutEffect re-measures before first client
// paint, so the fallback is never visible after hydration.

import { useLayoutEffect, useRef, useState } from "react";
import type { ChartSeries } from "./AnnotatedChart";

const FALLBACK_W = 720;
// Fractions of max where gridlines sit — must match AnnotatedChart, which
// pre-formats one grid label per fraction.
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

export default function ChartCanvas({
  series,
  xLabels,
  height,
  max,
  gridLabels,
  spikeI,
  peakValue,
  peakLabel,
}: {
  series: ChartSeries[];
  xLabels: string[];
  height: number;
  max: number;
  gridLabels: string[];
  spikeI: number;
  peakValue: number;
  peakLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setMeasured(Math.round(w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = measured ?? FALLBACK_W;
  const H = height;
  const compact = W < 640;
  const padL = 18;
  const padR = compact ? 64 : 120; // room for end-of-line labels / live dot
  const padT = 24;
  const padB = 22; // x-axis labels live inside the SVG bottom pad
  const n = xLabels.length;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) => (n <= 1 ? padL + innerW / 2 : padL + (i * innerW) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * innerH;

  const main = series[0];

  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  // End-of-line labels collide when several series finish at the same y (e.g.
  // total/input/output all near 0 in the last bucket). Spread them vertically
  // with a minimum gap, keeping value order, and nudge the stack up if it would
  // overflow into the x-axis labels. On compact widths the labels sit above the
  // line endpoint (anchored to the right edge) instead of beside it.
  const LABEL_GAP = 13;
  const endLabelY: number[] = (() => {
    const offset = compact ? -7 : 3;
    const items = series.map((s, si) => ({ si, yRaw: y(s.values[n - 1] ?? 0) + offset }));
    items.sort((a, b) => a.yRaw - b.yRaw);
    const out: number[] = [];
    let prev = -Infinity;
    for (const it of items) {
      const yy = Math.max(it.yRaw, prev + LABEL_GAP);
      out[it.si] = yy;
      prev = yy;
    }
    const bottom = H - padB - 2;
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

  // Sample x labels by available width (~64px per label); always keep the last
  // one and drop a sampled label that would crowd it.
  const maxLabels = Math.max(2, Math.floor(W / 64));
  const step = Math.max(1, Math.ceil(n / maxLabels));
  const xLabelIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2)) xLabelIdx.push(i);
  }

  // Peak callout text flips to anchor "end" when the spike sits near the right
  // edge so it never overflows the (possibly small) right pad.
  const peakNearRight = main ? x(spikeI) > W - padR - 70 : false;

  return (
    <div ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: H }}
        role="img"
        aria-label={`line chart of ${series.map((s) => s.name).join(", ")}${
          xLabels.length > 0 ? ` from ${xLabels[0]} to ${xLabels[xLabels.length - 1]}` : ""
        }`}
      >
        {/* gridlines + floating y labels */}
        {GRID_FRACTIONS.map((f, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--hair)"
              strokeWidth={0.5}
            />
            <text
              x={padL + 2}
              y={y(max * f) - 3}
              fontSize={10}
              fill="var(--faint)"
              fontFamily="var(--font-mono), monospace"
            >
              {gridLabels[i]}
            </text>
          </g>
        ))}

        {/* area under main line */}
        {areaPath && <path d={areaPath} fill="var(--chart-area)" stroke="none" />}

        {/* peak callout — skip when the window is entirely empty (no "peak 0") */}
        {main && n > 1 && peakValue > 0 && (
          <g>
            <line
              x1={x(spikeI)}
              x2={x(spikeI)}
              y1={y(peakValue)}
              y2={H - padB}
              stroke="var(--faint)"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
            <text
              x={peakNearRight ? x(spikeI) - 4 : x(spikeI) + 4}
              y={y(peakValue) - 7}
              fontSize={10}
              fill="var(--muted)"
              textAnchor={peakNearRight ? "end" : "start"}
            >
              {peakLabel}
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
              x={compact ? W - 4 : x(n - 1) + 6}
              y={endLabelY[si]}
              fontSize={9}
              fontFamily="var(--font-mono), monospace"
              fontWeight={600}
              letterSpacing={0.6}
              fill={s.color}
              opacity={si === 0 ? 1 : 0.9}
              textAnchor={compact ? "end" : "start"}
            >
              {s.name.toUpperCase()}
            </text>
            {si === 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1] ?? 0)} r={4} fill={s.color} />}
          </g>
        ))}

        {/* x axis — drawn inside the SVG so labels always align with x(i) */}
        {xLabelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            fontSize={10}
            fill="var(--faint)"
            fontFamily="var(--font-mono), monospace"
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          >
            {xLabels[i]}
          </text>
        ))}
      </svg>
    </div>
  );
}
