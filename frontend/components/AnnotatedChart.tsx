// Annotated line chart drawn from the inside: y-values float on the gridlines,
// line names sit at each line's end, the peak gets a dashed callout, and the
// main line carries a live endpoint dot. No legend box.
//
// This file stays server-renderable so pages can keep passing a `format`
// function (functions can't cross the server→client boundary). All text that
// needs formatting is width-independent, so it's pre-formatted here and handed
// to the measured client canvas as plain strings.

import ChartCanvas from "./ChartCanvas";

export type ChartSeries = {
  name: string;
  color: string;
  values: number[];
  dashed?: boolean;
};

// Fractions of max where gridlines sit — must match GRID_FRACTIONS in ChartCanvas.
const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;

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
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const main = series[0];

  let spikeI = 0;
  if (main) main.values.forEach((v, i) => (v > main.values[spikeI] ? (spikeI = i) : null));
  const peakValue = main ? (main.values[spikeI] ?? 0) : 0;

  return (
    <ChartCanvas
      series={series}
      xLabels={xLabels}
      height={height}
      max={max}
      gridLabels={GRID_FRACTIONS.map((f) => format(max * f))}
      spikeI={spikeI}
      peakValue={peakValue}
      peakLabel={`peak ${format(peakValue)}`}
    />
  );
}
