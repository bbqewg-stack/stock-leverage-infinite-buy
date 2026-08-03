"use client";

import { useMemo, useRef, useState } from "react";
import { TradeLogEntry } from "@/lib/infiniteBuy";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const qtyStr = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}주`;
const signedWon = (n: number) => `${n >= 0 ? "+" : ""}${won(n)}`;

interface Point {
  date: string;
  cumQty: number;
  cumAmount: number;
  avgPrice: number;
  profit: number;
  profitPercent: number;
}

// 매도는 매도 시점의 가중평균 매입단가로 원가를 덜어낸다 — summarizeTradeLog와
// 동일한 방식으로 계산해야 그래프와 요약 카드 숫자가 서로 어긋나지 않는다.
function buildPoints(log: TradeLogEntry[], currentPrice?: number): Point[] {
  let cumQty = 0;
  let cumAmount = 0;
  return log.map((entry) => {
    if (entry.type === "sell") {
      const avgCost = cumQty > 0 ? cumAmount / cumQty : 0;
      const sellQty = Math.min(entry.qty, cumQty);
      cumQty -= sellQty;
      cumAmount -= sellQty * avgCost;
    } else {
      cumQty += entry.qty;
      cumAmount += entry.price * entry.qty;
    }
    const avgPrice = cumQty > 0 ? cumAmount / cumQty : 0;
    const marketValue =
      currentPrice !== undefined ? cumQty * currentPrice : cumAmount;
    const profit = marketValue - cumAmount;
    const profitPercent = cumAmount > 0 ? (profit / cumAmount) * 100 : 0;
    return {
      date: entry.date,
      cumQty,
      cumAmount,
      avgPrice,
      profit,
      profitPercent,
    };
  });
}

const VB_W = 300;
const VB_H = 96;
const PAD_X = 4;
const PAD_TOP = 16;
const PAD_BOTTOM = 10;

function ChartBlock({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-[var(--text-secondary)]">
          {title}
        </h3>
        {hint && (
          <span className="text-[10px] text-[var(--text-muted)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function LineChart({
  points,
  getValue,
  color,
  formatValue,
  refValue,
  refLabel,
}: {
  points: Point[];
  getValue: (p: Point) => number;
  color: string;
  formatValue: (n: number) => string;
  refValue?: number;
  refLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const values = points.map(getValue);
  const allValues = refValue !== undefined ? [...values, refValue] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const innerW = VB_W - PAD_X * 2;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const baseY = PAD_TOP + innerH;

  const xAt = (i: number) =>
    points.length > 1
      ? PAD_X + (i / (points.length - 1)) * innerW
      : PAD_X + innerW / 2;
  const yAt = (v: number) => PAD_TOP + innerH - ((v - min) / range) * innerH;

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(getValue(p)).toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${xAt(points.length - 1).toFixed(2)} ${baseY.toFixed(2)} L ${xAt(0).toFixed(2)} ${baseY.toFixed(2)} Z`;

  const lastPoint = points[points.length - 1];

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || points.length === 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(ratio * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, idx)));
  }

  const hoverPoint = hover !== null ? points[hover] : null;
  const hoverLeftPct = hover !== null ? (xAt(hover) / VB_W) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative touch-none"
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-20 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        {refValue !== undefined && (
          <>
            <line
              x1={PAD_X}
              x2={VB_W - PAD_X}
              y1={yAt(refValue)}
              y2={yAt(refValue)}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {refLabel && (
              <text
                x={PAD_X}
                y={yAt(refValue) - 3}
                textAnchor="start"
                fontSize={8}
                className="fill-[var(--text-muted)]"
              >
                {refLabel} {formatValue(refValue)}
              </text>
            )}
          </>
        )}
        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hover !== null && hoverPoint && (
          <line
            x1={xAt(hover)}
            x2={xAt(hover)}
            y1={PAD_TOP}
            y2={baseY}
            stroke="var(--hairline)"
            strokeWidth={1}
          />
        )}
        <circle
          cx={xAt(hover ?? points.length - 1)}
          cy={yAt(getValue(hoverPoint ?? lastPoint))}
          r={4}
          fill={color}
          stroke="var(--surface)"
          strokeWidth={2}
        />
      </svg>
      <div className="pointer-events-none absolute right-0 top-0 text-right text-xs font-medium tabular-nums text-[var(--text-secondary)]">
        {formatValue(getValue(lastPoint))}
      </div>
      {hoverPoint && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--surface)] px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${Math.min(88, Math.max(12, hoverLeftPct))}%`,
          }}
        >
          <div className="text-[var(--text-muted)]">{hoverPoint.date}</div>
          <div className="font-medium tabular-nums">
            {formatValue(getValue(hoverPoint))}
          </div>
        </div>
      )}
    </div>
  );
}

function barPath(
  x: number,
  width: number,
  yTop: number,
  yBottom: number,
  roundTop: boolean,
) {
  const r = Math.min(4, width / 2, Math.max(0, yBottom - yTop));
  if (r <= 0)
    return `M ${x} ${yTop} L ${x + width} ${yTop} L ${x + width} ${yBottom} L ${x} ${yBottom} Z`;
  if (roundTop) {
    return `M ${x} ${yBottom} L ${x} ${yTop + r} Q ${x} ${yTop} ${x + r} ${yTop} L ${x + width - r} ${yTop} Q ${x + width} ${yTop} ${x + width} ${yTop + r} L ${x + width} ${yBottom} Z`;
  }
  return `M ${x} ${yTop} L ${x} ${yBottom - r} Q ${x} ${yBottom} ${x + r} ${yBottom} L ${x + width - r} ${yBottom} Q ${x + width} ${yBottom} ${x + width} ${yBottom - r} L ${x + width} ${yTop} Z`;
}

function BarChart({
  points,
  getValue,
  formatValue,
  formatSub,
}: {
  points: Point[];
  getValue: (p: Point) => number;
  formatValue: (n: number) => string;
  formatSub?: (p: Point) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const values = points.map(getValue);
  const maxAbs = Math.max(1, ...values.map((v) => Math.abs(v)));

  const innerW = VB_W - PAD_X * 2;
  const innerH = VB_H - PAD_TOP - PAD_BOTTOM;
  const midY = PAD_TOP + innerH / 2;
  const scale = innerH / 2 / maxAbs;

  const n = points.length;
  const slot = innerW / n;
  const barWidth = Math.min(20, slot * 0.6);

  const hoverPoint = hover !== null ? points[hover] : null;
  const hoverLeftPct =
    hover !== null ? ((PAD_X + hover * slot + slot / 2) / VB_W) * 100 : 0;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-20 w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <line
          x1={PAD_X}
          x2={VB_W - PAD_X}
          y1={midY}
          y2={midY}
          stroke="var(--hairline)"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const v = getValue(p);
          const isRise = v >= 0;
          const barH = Math.abs(v) * scale;
          const x = PAD_X + i * slot + (slot - barWidth) / 2;
          const yTop = isRise ? midY - barH : midY;
          const yBottom = isRise ? midY : midY + barH;
          const color = isRise ? "var(--rise)" : "var(--fall)";
          return (
            <path
              key={`${p.date}-${i}`}
              d={barPath(x, barWidth, yTop, yBottom, isRise)}
              fill={color}
              opacity={hover === null || hover === i ? 1 : 0.4}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      {hoverPoint && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--surface)] px-2 py-1 text-xs shadow-sm"
          style={{
            left: `${Math.min(88, Math.max(12, hoverLeftPct))}%`,
          }}
        >
          <div className="text-[var(--text-muted)]">{hoverPoint.date}</div>
          <div
            className={`font-medium tabular-nums ${
              getValue(hoverPoint) >= 0
                ? "text-[var(--rise)]"
                : "text-[var(--fall)]"
            }`}
          >
            {formatValue(getValue(hoverPoint))}
          </div>
          {formatSub && (
            <div className="text-[var(--text-muted)]">
              {formatSub(hoverPoint)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TradeLogCharts({
  log,
  currentPrice,
}: {
  log: TradeLogEntry[];
  currentPrice?: number;
}) {
  const points = useMemo(
    () => buildPoints(log, currentPrice),
    [log, currentPrice],
  );

  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        매수 기록이 쌓이면 그래프로 볼 수 있어요.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ChartBlock title="누적 매수량">
        <LineChart
          points={points}
          getValue={(p) => p.cumQty}
          color="var(--accent)"
          formatValue={qtyStr}
        />
      </ChartBlock>

      <ChartBlock title="누적 매입금액">
        <LineChart
          points={points}
          getValue={(p) => p.cumAmount}
          color="var(--accent)"
          formatValue={won}
        />
      </ChartBlock>

      <ChartBlock title="평단가 추이">
        <LineChart
          points={points}
          getValue={(p) => p.avgPrice}
          color="var(--accent)"
          formatValue={won}
          refValue={currentPrice}
          refLabel="현재가"
        />
      </ChartBlock>

      {currentPrice !== undefined ? (
        <ChartBlock title="평가손익 추이" hint="빨강 이익 · 파랑 손실">
          <BarChart
            points={points}
            getValue={(p) => p.profit}
            formatValue={signedWon}
            formatSub={(p) =>
              `${p.profitPercent >= 0 ? "+" : ""}${p.profitPercent.toFixed(1)}%`
            }
          />
        </ChartBlock>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          실시간 시세가 없어 평가손익 그래프는 볼 수 없어요. 종목 코드를
          등록하면 볼 수 있어요.
        </p>
      )}
    </div>
  );
}
