"use client";

import { Stock } from "@/lib/infiniteBuy";
import { LiveQuoteState } from "@/lib/useLivePrices";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export default function LivePriceSidebar({
  stocks,
  activeId,
  quotes,
  onSelect,
  onRefresh,
}: {
  stocks: Stock[];
  activeId: string;
  quotes: Record<string, LiveQuoteState>;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="hidden shrink-0 flex-col gap-3 border-r border-[var(--hairline)] bg-[var(--surface)] px-4 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">실시간 시세</h2>
        <button
          onClick={onRefresh}
          title="새로고침"
          className="rounded-md px-1.5 py-0.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
        >
          ↻
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {stocks.map((s) => {
          const state = s.ticker ? quotes[s.ticker] : undefined;
          const q = state?.quote;
          const nameMismatch = !!q && q.name.trim() !== s.name.trim();
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                  s.id === activeId
                    ? "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30"
                    : "bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/70"
                }`}
              >
                <div className="truncate text-sm font-medium">{s.name}</div>
                {!s.ticker ? (
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    코드 미등록 · 탭에서 등록하면 시세가 표시돼요
                  </div>
                ) : q ? (
                  <>
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <span className="text-base font-semibold tabular-nums">
                        {won(q.price)}
                      </span>
                      <span
                        className={`shrink-0 text-xs font-medium tabular-nums ${
                          q.isRising
                            ? "text-[var(--success)]"
                            : "text-[var(--critical)]"
                        }`}
                      >
                        {q.isRising ? "▲" : "▼"}{" "}
                        {Math.abs(q.changeRatio).toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {q.marketStatus === "OPEN" ? "장중" : "종가"} ·{" "}
                      {q.updatedAt?.slice(11, 16)} 기준
                    </div>
                    {nameMismatch && (
                      <div className="mt-1 text-[10px] font-medium text-[var(--critical)]">
                        ⚠ 코드 {s.ticker}의 실제 종목명은 &ldquo;{q.name}&rdquo;이에요. 코드가 맞는지
                        확인해 주세요.
                      </div>
                    )}
                  </>
                ) : state?.error ? (
                  <div className="mt-0.5 text-xs text-[var(--critical)]">
                    {state.error}
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    불러오는 중…
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
