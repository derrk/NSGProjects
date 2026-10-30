import { formatUSD } from "@/lib/money";
import type { HistoryPoint } from "@/lib/investments";

/**
 * Dependency-free portfolio curve: a filled market-value area with the cost
 * basis drawn as a dashed line beneath it. The gap between them is unrealized
 * gain. Points are spaced by index (one per captured day). Theme colors come
 * from currentColor on the wrapping <g> so light/dark both work.
 */
export function PortfolioChart({ points }: { points: HistoryPoint[] }) {
  const W = 760;
  const H = 260;
  const padL = 10;
  const padR = 10;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = points.length;

  const values = points.flatMap((p) => [p.marketValueCents, p.costBasisCents]);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (!isFinite(min) || !isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.08;
  max += span * 0.08;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / (max - min)) * innerH;
  const baseline = padT + innerH;

  const marketLine = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.marketValueCents).toFixed(1)}`).join(" ");
  const costLine = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.costBasisCents).toFixed(1)}`).join(" ");
  const area =
    n > 0
      ? `M ${x(0).toFixed(1)} ${baseline.toFixed(1)} ` +
        points.map((p, i) => `L ${x(i).toFixed(1)} ${y(p.marketValueCents).toFixed(1)}`).join(" ") +
        ` L ${x(n - 1).toFixed(1)} ${baseline.toFixed(1)} Z`
      : "";

  const first = points[0];
  const last = points[n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Investment portfolio value over time">
      {/* market value area + line */}
      <g className="text-sky-500">
        {area ? <path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" /> : null}
        <path d={marketLine} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {n === 1 ? <circle cx={x(0)} cy={y(points[0].marketValueCents)} r={3.5} fill="currentColor" /> : null}
      </g>
      {/* cost basis line (dashed) */}
      <g className="text-muted-foreground">
        <path d={costLine} fill="none" stroke="currentColor" strokeWidth={1.75} strokeDasharray="5 4" strokeLinejoin="round" strokeOpacity={0.8} />
      </g>
      {/* y range labels (right edge, inside the plot) */}
      <g className="fill-muted-foreground text-[11px]">
        <text x={W - padR} y={padT + 8} textAnchor="end">{formatUSD(Math.round(max))}</text>
        <text x={W - padR} y={baseline - 4} textAnchor="end">{formatUSD(Math.round(min))}</text>
      </g>
      {/* x endpoints (axis row below the plot) */}
      {n > 1 ? (
        <g className="fill-muted-foreground text-[11px]">
          <text x={padL} y={baseline + 17} textAnchor="start">{first.day}</text>
          <text x={W - padR} y={baseline + 17} textAnchor="end">{last.day}</text>
        </g>
      ) : (
        <g className="fill-muted-foreground text-[11px]">
          <text x={W / 2} y={baseline + 17} textAnchor="middle">{last?.day ?? ""}</text>
        </g>
      )}
    </svg>
  );
}
