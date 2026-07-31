"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Stock, summarizeTradeLog } from "@/lib/infiniteBuy";
import { fetchRemoteState, loadStocks } from "@/lib/stockStore";
import { useLivePrices } from "@/lib/useLivePrices";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "rise" | "fall";
}) {
  const toneClass =
    tone === "rise"
      ? "text-[var(--rise)]"
      : tone === "fall"
        ? "text-[var(--fall)]"
        : "";
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && (
        <div
          className={`mt-0.5 text-xs ${tone ? toneClass : "text-[var(--text-muted)]"}`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stocks, setStocks] = useState<Stock[]>(() => loadStocks());

  useEffect(() => {
    let cancelled = false;
    fetchRemoteState().then((result) => {
      if (!cancelled && result.ok && result.state)
        setStocks(result.state.stocks);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tickers = stocks.map((s) => s.ticker).filter((t): t is string => !!t);
  const { quotes, refresh } = useLivePrices(tickers);

  const rows = useMemo(
    () =>
      stocks.map((stock) => {
        const summary = summarizeTradeLog(stock.log);
        const quote = stock.ticker ? quotes[stock.ticker]?.quote : undefined;
        const currentPrice = quote?.price ?? summary.avgPrice;
        const marketValue = summary.totalQty * currentPrice;
        const profit = marketValue - summary.totalAmount;
        const profitPercent =
          summary.totalAmount > 0 ? (profit / summary.totalAmount) * 100 : 0;
        return {
          stock,
          summary,
          quote,
          currentPrice,
          marketValue,
          profit,
          profitPercent,
        };
      }),
    [stocks, quotes],
  );

  const holdings = rows.filter((r) => r.summary.totalQty > 0);

  const totals = useMemo(() => {
    const totalInvested = holdings.reduce(
      (sum, r) => sum + r.summary.totalAmount,
      0,
    );
    const totalValue = holdings.reduce((sum, r) => sum + r.marketValue, 0);
    const totalProfit = totalValue - totalInvested;
    const totalProfitPercent =
      totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    return { totalInvested, totalValue, totalProfit, totalProfitPercent };
  }, [holdings]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            포트폴리오 대시보드
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            등록된 모든 종목의 매수 기록을 합산한 현황과 실시간 평가손익
          </p>
        </div>
        <Link
          href="/"
          className="whitespace-nowrap rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
        >
          ← 계산기로
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="총 매입금액" value={won(totals.totalInvested)} />
        <StatCard label="총 평가금액" value={won(totals.totalValue)} />
        <StatCard
          label="평가손익"
          value={`${totals.totalProfit >= 0 ? "+" : ""}${won(totals.totalProfit)}`}
          sub={pct(totals.totalProfitPercent)}
          tone={totals.totalProfit >= 0 ? "rise" : "fall"}
        />
        <StatCard
          label="보유 종목"
          value={`${holdings.length} / ${stocks.length}개`}
        />
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full bg-[var(--accent)]" />
            <h2 className="text-base font-semibold tracking-tight">
              종목별 현황
            </h2>
          </div>
          <button
            onClick={refresh}
            className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--foreground)]"
          >
            시세 새로고침
          </button>
        </div>

        {holdings.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            아직 매수 기록이 있는 종목이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--hairline)] text-left text-[var(--text-muted)]">
                  <th className="py-1.5 font-normal">종목</th>
                  <th className="py-1.5 text-right font-normal">보유수량</th>
                  <th className="py-1.5 text-right font-normal">평단가</th>
                  <th className="py-1.5 text-right font-normal">매입금액</th>
                  <th className="py-1.5 text-right font-normal">현재가</th>
                  <th className="py-1.5 text-right font-normal">평가금액</th>
                  <th className="py-1.5 text-right font-normal">평가손익</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map(
                  ({
                    stock,
                    summary,
                    quote,
                    currentPrice,
                    marketValue,
                    profit,
                    profitPercent,
                  }) => (
                    <tr
                      key={stock.id}
                      className="border-b border-[var(--hairline)]/60"
                    >
                      <td className="py-1.5">
                        <div className="font-medium">{stock.name}</div>
                        {stock.ticker && (
                          <div className="text-xs text-[var(--text-muted)]">
                            {stock.ticker}
                            {!quote && " · 시세 미확인(평단가 기준)"}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {summary.totalQty.toLocaleString("ko-KR")}주
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {won(summary.avgPrice)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {won(summary.totalAmount)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {quote ? won(currentPrice) : "-"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {won(marketValue)}
                      </td>
                      <td
                        className={`py-1.5 text-right tabular-nums font-medium ${
                          profit >= 0
                            ? "text-[var(--rise)]"
                            : "text-[var(--fall)]"
                        }`}
                      >
                        {profit >= 0 ? "+" : ""}
                        {won(profit)} ({pct(profitPercent)})
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
