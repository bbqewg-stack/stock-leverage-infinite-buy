"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  InfiniteBuySettings,
  ScheduleRow,
  Stock,
  TradeLogEntry,
  TradeLogSummary,
  computeSchedule,
  computeTodaySuggestion,
  createStock,
  summarizeTradeLog,
} from "@/lib/infiniteBuy";
import {
  ACTIVE_KEY,
  DEFAULT_SETTINGS_KEY,
  STOCKS_KEY,
  fetchRemoteState,
  isPendingSync,
  loadDefaultSettings,
  loadJSON,
  loadStocks,
  markPendingSync,
  saveRemoteState,
} from "@/lib/stockStore";
import { downloadBackup, parseBackupFile } from "@/lib/backup";
import { exportStockToExcel } from "@/lib/exportExcel";
import { useLivePrices, type LiveQuoteState } from "@/lib/useLivePrices";
import LivePriceSidebar from "@/components/LivePriceSidebar";
import TradeLogCharts from "@/components/TradeLogCharts";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const pad2 = (n: number) => String(n).padStart(2, "0");
const nowStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

function loadInitialState(): { stocks: Stock[]; activeId: string } {
  const stocks = loadStocks();
  const savedActiveId = loadJSON<string | null>(ACTIVE_KEY, null);
  const activeId =
    savedActiveId && stocks.some((s) => s.id === savedActiveId)
      ? savedActiveId
      : stocks[0].id;
  return { stocks, activeId };
}

// 모듈 스코프에서 한 번만 계산해 stocks/activeId 두 useState가 같은 초기값을 공유하게 한다.
let cachedInitialState: { stocks: Stock[]; activeId: string } | null = null;
function getInitialState() {
  if (cachedInitialState === null) cachedInitialState = loadInitialState();
  return cachedInitialState;
}

const SETTINGS_FIELDS: {
  key: keyof InfiniteBuySettings;
  label: string;
}[] = [
  { key: "basePrice", label: "기준(1일차) 매수단가" },
  { key: "perOrderAmount", label: "1회 평균 투자금액" },
  { key: "riseLimitPercent", label: "매도 기준 상승률" },
  { key: "riseStepPercent", label: "상승구간 회차당 변동폭" },
  { key: "fallStepPercent", label: "하락구간 회차당 변동폭" },
  { key: "fallScale", label: "하락구간 계산 분모" },
  { key: "totalRounds", label: "총 시뮬레이션 회차 수" },
];

const inputClass =
  "w-full rounded-lg border border-[var(--hairline)] bg-transparent px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

const SECTION_OPEN_KEY_PREFIX = "infinite-buy:section-open:";

function CollapsibleSection({
  id,
  title,
  actions,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen;
    const saved = window.localStorage.getItem(
      `${SECTION_OPEN_KEY_PREFIX}${id}`,
    );
    return saved === null ? defaultOpen : saved === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(
      `${SECTION_OPEN_KEY_PREFIX}${id}`,
      String(open),
    );
  }, [id, open]);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
      <div
        className={`flex items-center justify-between gap-3 ${open ? "mb-5" : ""}`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className="h-4 w-1 rounded-full bg-[var(--accent)]" />
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <span
            className={`text-xs text-[var(--text-muted)] transition-transform ${open ? "" : "-rotate-90"}`}
          >
            ▾
          </span>
        </button>
        {open && actions && (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
      {open && children}
    </section>
  );
}

function PhaseBadge({
  phase,
  changePercent,
}: {
  phase: "rise" | "fall";
  changePercent: number;
}) {
  const isRise = phase === "rise";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        isRise
          ? "bg-[var(--rise)]/10 text-[var(--rise)]"
          : "bg-[var(--fall)]/10 text-[var(--fall)]"
      }`}
    >
      {isRise ? "▲" : "▼"} {pct(changePercent)}
    </span>
  );
}

function TradeTypeBadge({ type }: { type?: "buy" | "sell" }) {
  const isSell = type === "sell";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isSell
          ? "bg-[var(--surface-2)] text-[var(--text-secondary)]"
          : "bg-[var(--accent)]/10 text-[var(--accent-text)]"
      }`}
    >
      {isSell ? "매도" : "매수"}
    </span>
  );
}

function toneTextClass(tone?: "rise" | "fall") {
  return tone === "rise"
    ? "text-[var(--rise)]"
    : tone === "fall"
      ? "text-[var(--fall)]"
      : "";
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--hairline)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
    >
      {children}
    </button>
  );
}

const ExcelIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    className="h-4 w-4"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </svg>
);

const DownloadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 20h16" />
  </svg>
);

const UploadIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
  >
    <path d="M12 21V9" />
    <path d="M7 14l5-5 5 5" />
    <path d="M4 4h16" />
  </svg>
);

function StatTile({
  label,
  value,
  sub,
  tone,
  subTone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "rise" | "fall";
  subTone?: "rise" | "fall";
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${toneTextClass(tone)}`}>
        {value}
      </div>
      {sub && (
        <div
          className={`mt-0.5 text-xs ${
            subTone
              ? toneTextClass(subTone)
              : tone
                ? toneTextClass(tone)
                : "text-[var(--text-muted)]"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function TodayCalculator({
  stock,
  liveState,
  summary,
  onAdd,
  onRefresh,
}: {
  stock: Stock;
  liveState?: LiveQuoteState;
  summary: TradeLogSummary;
  onAdd: (entry: TradeLogEntry) => void;
  onRefresh: () => void;
}) {
  const quote = liveState?.quote;
  const [mode, setMode] = useState<"buy" | "sell">("buy");

  // 종목별 실시간 시세가 있으면 그 값을 기본값으로 쓰고, 없으면 기준단가로
  // 시작한다. 사용자가 직접 값을 고치기 전까지는 시세가 갱신될 때마다 따라간다.
  const [todayPrice, setTodayPrice] = useState<number>(
    () => quote?.price ?? stock.settings.basePrice,
  );
  const [priceManuallySet, setPriceManuallySet] = useState(false);
  const [lastQuotePrice, setLastQuotePrice] = useState(quote?.price);
  if (quote && quote.price !== lastQuotePrice) {
    setLastQuotePrice(quote.price);
    if (!priceManuallySet) setTodayPrice(quote.price);
  }

  const suggestion = computeTodaySuggestion(
    todayPrice || stock.settings.basePrice,
    stock.settings,
  );

  // 매수 스케줄대로 무조건 사겠다는 보장이 없으니, 추천 매수량은 기본값으로만
  // 쓰고 실제 매수 직전에 수량을 직접 조정할 수 있게 한다. 매입단가가
  // 바뀌면(직접 입력/실시간가 적용) 새로 추천값을 기본값으로 되돌린다.
  const [qtyOverride, setQtyOverride] = useState<number | null>(null);
  const [lastPriceForOverride, setLastPriceForOverride] = useState(todayPrice);
  if (todayPrice !== lastPriceForOverride) {
    setLastPriceForOverride(todayPrice);
    setQtyOverride(null);
  }

  // 매도 수량은 기본값으로 보유수량 전체(10% 상승 시 전량 매도 원칙)를 제안하고,
  // 보유수량이 바뀌면(다른 매수/매도 반영) 아직 손대지 않은 값은 다시 맞춘다.
  const [sellQtyOverride, setSellQtyOverride] = useState<number | null>(null);
  const [lastHeldQtyForSell, setLastHeldQtyForSell] = useState(
    summary.totalQty,
  );
  if (summary.totalQty !== lastHeldQtyForSell) {
    setLastHeldQtyForSell(summary.totalQty);
    setSellQtyOverride(null);
  }

  const buyQty = qtyOverride ?? suggestion.buyQty;
  const sellQty = sellQtyOverride ?? summary.totalQty;
  const qty = mode === "buy" ? buyQty : sellQty;
  const price = todayPrice || stock.settings.basePrice;
  const amount = qty * price;
  const exceedsHolding = mode === "sell" && sellQty > summary.totalQty;
  const canSubmit = qty > 0 && !exceedsHolding;

  function addToLog() {
    onAdd({
      id: crypto.randomUUID(),
      date: nowStr(),
      type: mode,
      price,
      qty,
    });
    if (mode === "sell") setSellQtyOverride(null);
  }

  return (
    <CollapsibleSection id="today-calculator" title="오늘 매입 계산기">
      <div className="mb-4 inline-flex rounded-lg border border-[var(--hairline)] p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("buy")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === "buy"
              ? "bg-[var(--accent-hover)] text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
          }`}
        >
          매수
        </button>
        <button
          type="button"
          onClick={() => setMode("sell")}
          className={`rounded-md px-3 py-1.5 font-medium transition ${
            mode === "sell"
              ? "bg-[var(--accent-hover)] text-white"
              : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
          }`}
        >
          매도
        </button>
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--text-muted)]">
              오늘 {mode === "buy" ? "매입단가" : "매도단가"}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={todayPrice}
                onChange={(e) => {
                  setTodayPrice(Number(e.target.value));
                  setPriceManuallySet(true);
                }}
                className={`${inputClass} w-40`}
              />
              {stock.ticker && (
                <button
                  type="button"
                  onClick={() => {
                    if (!quote) return;
                    setTodayPrice(quote.price);
                    setPriceManuallySet(false);
                  }}
                  disabled={!quote}
                  className="whitespace-nowrap rounded-lg border border-[var(--hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {quote
                    ? `실시간가 적용 (${won(quote.price)})`
                    : liveState?.loading
                      ? "불러오는 중…"
                      : "실시간 시세 대기 중"}
                </button>
              )}
            </div>
          </label>
          {mode === "buy" && (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-[var(--text-muted)]">변동률</span>
              <PhaseBadge
                phase={suggestion.phase}
                changePercent={suggestion.changePercent}
              />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--text-muted)]">
              {mode === "buy" ? "주문 매수량" : "매도 수량"}
              {mode === "buy" &&
                qtyOverride !== null &&
                qtyOverride !== suggestion.buyQty && (
                  <span className="ml-1 text-[var(--text-muted)]">
                    (추천 {suggestion.buyQty.toLocaleString("ko-KR")}주)
                  </span>
                )}
              {mode === "sell" && (
                <span className="ml-1 text-[var(--text-muted)]">
                  (보유 {summary.totalQty.toLocaleString("ko-KR")}주)
                </span>
              )}
            </span>
            <input
              type="number"
              value={qty}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (mode === "buy") setQtyOverride(value);
                else setSellQtyOverride(value);
              }}
              className={`${inputClass} w-24`}
            />
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-[var(--text-muted)]">
              {mode === "buy" ? "매입금액" : "매도금액"}
            </span>
            <span className="font-semibold tabular-nums">{won(amount)}</span>
          </div>
          <button
            onClick={addToLog}
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--accent-hover)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "buy" ? "매수 기록에 추가" : "매도 기록에 추가"}
          </button>
        </div>
        {exceedsHolding && (
          <p className="text-xs text-[var(--critical)]">
            보유수량({summary.totalQty.toLocaleString("ko-KR")}주)보다 많이 팔
            수 없어요.
          </p>
        )}
      </div>

      {!stock.ticker && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          종목 탭 아래 &ldquo;종목 코드 등록&rdquo;에 네이버 금융 6자리 코드를
          입력하면 좌측 패널에서 실시간 시세가 자동으로 갱신돼요.
        </p>
      )}
      {stock.ticker && quote && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          {quote.name} · {won(quote.price)} ·{" "}
          {quote.marketStatus === "OPEN" ? "장중" : "종가"} 기준 (
          {quote.updatedAt?.slice(11, 16)}){" "}
          <button
            type="button"
            onClick={onRefresh}
            className="underline underline-offset-2 hover:text-[var(--foreground)]"
          >
            새로고침
          </button>
        </p>
      )}
      {stock.ticker && liveState?.error && (
        <p className="mt-3 text-xs text-[var(--critical)]">{liveState.error}</p>
      )}
    </CollapsibleSection>
  );
}

export default function InfiniteBuyCalculator() {
  const [stocks, setStocks] = useState<Stock[]>(() => getInitialState().stocks);
  const [activeId, setActiveId] = useState<string>(
    () => getInitialState().activeId,
  );
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [newStockName, setNewStockName] = useState("");
  const [newStockTicker, setNewStockTicker] = useState("");
  const [isFetchingNewStockName, setIsFetchingNewStockName] = useState(false);

  // 종목코드만 입력하고 종목명은 비워두면, 네이버 금융에서 종목명을 조회해
  // 자동으로 채워준다. 사용자가 이미 이름을 직접 입력했다면 건드리지 않는다.
  useEffect(() => {
    if (!isAddingStock) return;
    const code = newStockTicker.trim();
    if (!/^\d{6}$/.test(code) || newStockName.trim()) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFetchingNewStockName(true);
    fetch(`/api/stock-price?code=${code}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.name) return;
        setNewStockName((current) => (current.trim() ? current : data.name));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsFetchingNewStockName(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newStockTicker, isAddingStock]);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isEditingTicker, setIsEditingTicker] = useState(false);
  const [tickerValue, setTickerValue] = useState("");
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [defaultSettings, setDefaultSettings] = useState<InfiniteBuySettings>(
    () => loadDefaultSettings(),
  );

  useEffect(() => {
    window.localStorage.setItem(
      DEFAULT_SETTINGS_KEY,
      JSON.stringify(defaultSettings),
    );
  }, [defaultSettings]);

  useEffect(() => {
    window.localStorage.setItem(STOCKS_KEY, JSON.stringify(stocks));
  }, [stocks]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // 브라우저가 초기화돼도 데이터가 남아있도록, 서버(DB)에 저장된 상태가 있으면
  // 로컬 캐시보다 우선해서 덮어쓴다. 서버 fetch를 "성공적으로 확인"하기 전까지는
  // 절대 자동저장을 켜지 않는다 — 네트워크 오류로 fetch가 실패했는데도 저장을
  // 켜버리면, 로컬의 빈/기본 상태가 서버의 진짜 데이터를 덮어쓸 수 있다.
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const [remoteSyncFailed, setRemoteSyncFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    async function tryHydrate() {
      const result = await fetchRemoteState();
      if (cancelled) return;
      if (!result.ok) {
        setRemoteSyncFailed(true);
        retryTimer = setTimeout(tryHydrate, 4000);
        return;
      }
      setRemoteSyncFailed(false);
      if (isPendingSync()) {
        // 지난 세션에서 만든 변경사항이 서버로 확실히 전송되지 못한 채 남아있다.
        // 서버 값(더 오래된 값)으로 지금 로컬 상태를 덮어쓰면 그 변경사항이
        // 사라지므로, 반대로 지금 로컬 상태를 서버로 다시 밀어올린다.
        saveRemoteState(stocks, activeId);
      } else if (result.state) {
        setStocks(result.state.stocks);
        setActiveId(result.state.activeId);
      }
      setHasHydratedRemote(true);
    }

    tryHydrate();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasHydratedRemote) return;
    markPendingSync();
    const id = setTimeout(() => {
      saveRemoteState(stocks, activeId);
    }, 800);
    return () => clearTimeout(id);
  }, [stocks, activeId, hasHydratedRemote]);

  // 탭을 닫거나 다른 화면으로 전환하는 순간(=창을 완전히 닫기 직전 마지막 기회)
  // 저장이 안 된 변경사항을 즉시 전송한다. keepalive 덕분에 페이지가 언로드
  // 되는 도중에도 요청이 취소되지 않고 이어진다. 그래도 실패하면(오프라인 등)
  // PENDING_SYNC_KEY가 true로 남아있으니 다음에 열 때 위 하이드레이션 로직이
  // 다시 서버로 밀어올린다.
  const latestStateRef = useRef({ stocks, activeId });
  useEffect(() => {
    latestStateRef.current = { stocks, activeId };
  }, [stocks, activeId]);

  useEffect(() => {
    if (!hasHydratedRemote) return;
    const flush = () => {
      const { stocks: s, activeId: a } = latestStateRef.current;
      saveRemoteState(s, a, { keepalive: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [hasHydratedRemote]);

  const activeStock = stocks.find((s) => s.id === activeId) ?? stocks[0];

  function updateStock(id: string, updater: (s: Stock) => Stock) {
    setStocks((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
  }

  function updateSetting(key: keyof InfiniteBuySettings, value: number) {
    if (Number.isNaN(value)) return;
    updateStock(activeStock.id, (s) => ({
      ...s,
      settings: { ...s.settings, [key]: value },
    }));
  }

  function resetSettings() {
    updateStock(activeStock.id, (s) => ({ ...s, settings: defaultSettings }));
  }

  function addToLog(entry: TradeLogEntry) {
    updateStock(activeStock.id, (s) => ({ ...s, log: [...s.log, entry] }));
  }

  function removeFromLog(id: string) {
    updateStock(activeStock.id, (s) => ({
      ...s,
      log: s.log.filter((e) => e.id !== id),
    }));
  }

  async function submitNewStock(e: React.SubmitEvent) {
    e.preventDefault();
    const ticker = newStockTicker.trim();
    const validTicker = /^\d{6}$/.test(ticker) ? ticker : undefined;
    let name = newStockName.trim();
    if (!name && validTicker) {
      // 자동조회가 아직 안 끝났거나 실패했을 수 있으니, 제출 시점에 한 번 더 시도한다.
      try {
        const res = await fetch(`/api/stock-price?code=${validTicker}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.name) name = data.name;
        }
      } catch {
        // 조회 실패는 무시하고 아래에서 이름 없음으로 처리한다.
      }
    }
    if (!name) return;
    const stock = createStock(name, defaultSettings, validTicker);
    setStocks((prev) => [...prev, stock]);
    setActiveId(stock.id);
    setNewStockName("");
    setNewStockTicker("");
    setIsAddingStock(false);
  }

  function submitRename(e: React.SubmitEvent) {
    e.preventDefault();
    const name = renameValue.trim();
    if (name) updateStock(activeStock.id, (s) => ({ ...s, name }));
    setIsRenaming(false);
  }

  function submitTicker(e: React.SubmitEvent) {
    e.preventDefault();
    const ticker = tickerValue.trim();
    if (ticker && !/^\d{6}$/.test(ticker)) {
      setTickerError("6자리 숫자로 입력하세요 (예: 069500).");
      return;
    }
    updateStock(activeStock.id, (s) => ({ ...s, ticker: ticker || undefined }));
    setTickerError(null);
    setIsEditingTicker(false);
  }

  function deleteActiveStock() {
    if (stocks.length <= 1) return;
    if (!window.confirm(`"${activeStock.name}" 종목과 매수 기록을 삭제할까요?`))
      return;
    const next = stocks.filter((s) => s.id !== activeStock.id);
    setStocks(next);
    setActiveId(next[0].id);
  }

  function handleExportExcel() {
    exportStockToExcel(activeStock, computeSchedule(activeStock.settings));
  }

  function handleBackupDownload() {
    downloadBackup(stocks, activeId);
  }

  async function handleBackupFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const restored = await parseBackupFile(file);
      if (
        !window.confirm(
          `백업 파일에 종목 ${restored.stocks.length}개가 있습니다. 현재 데이터를 덮어쓰고 복원할까요?`,
        )
      ) {
        return;
      }
      setStocks(restored.stocks);
      setActiveId(restored.activeId);
      setBackupError(null);
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : "백업 복원에 실패했습니다.",
      );
    }
  }

  const schedule: ScheduleRow[] = computeSchedule(activeStock.settings);
  const summary = summarizeTradeLog(activeStock.log);
  const tickers = stocks.map((s) => s.ticker).filter((t): t is string => !!t);
  const { quotes, refresh } = useLivePrices(tickers);

  const activeQuote = activeStock.ticker
    ? quotes[activeStock.ticker]?.quote
    : undefined;
  const currentPrice = activeQuote?.price ?? summary.avgPrice;
  const marketValue = summary.totalQty * currentPrice;
  const profit = marketValue - summary.totalAmount;
  const profitPercent =
    summary.totalAmount > 0 ? (profit / summary.totalAmount) * 100 : 0;
  const priceGap = currentPrice - summary.avgPrice;

  return (
    <div className="flex w-full">
      <LivePriceSidebar
        stocks={stocks}
        activeId={activeStock.id}
        quotes={quotes}
        onSelect={setActiveId}
        onRefresh={refresh}
      />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              레버리지 무한매수 계산기
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              매일 무한매수법 · 기준단가 대비 하락 시 매수량 확대,{" "}
              {activeStock.settings.riseLimitPercent}% 상승 시 매도
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              ref={backupInputRef}
              type="file"
              accept="application/json"
              onChange={handleBackupFile}
              className="hidden"
            />
            <Link
              href="/dashboard"
              className="whitespace-nowrap rounded-lg bg-[var(--accent-hover)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              대시보드 보기 →
            </Link>
          </div>
        </header>
        {backupError && (
          <p className="-mt-4 text-xs text-[var(--critical)]">{backupError}</p>
        )}
        {!hasHydratedRemote && remoteSyncFailed && (
          <p className="-mt-4 text-xs text-[var(--critical)]">
            서버 연결에 실패해서 재시도하는 중이에요. 이 상태에서는 변경사항이
            서버에 저장되지 않으니, 연결이 복구될 때까지 잠시 기다려주세요.
          </p>
        )}

        {/* 종목 탭 */}
        <div className="flex flex-wrap items-center gap-2">
          {stocks.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setIsRenaming(false);
                setIsEditingTicker(false);
                setTickerError(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                s.id === activeId
                  ? "bg-[var(--accent-hover)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--foreground)]"
              }`}
            >
              {s.name}
            </button>
          ))}

          {isAddingStock ? (
            <form
              onSubmit={submitNewStock}
              className="flex items-center gap-1.5"
            >
              <input
                autoFocus
                value={newStockName}
                onChange={(e) => setNewStockName(e.target.value)}
                placeholder={
                  isFetchingNewStockName ? "종목명 불러오는 중…" : "종목명 입력"
                }
                className="w-32 rounded-full border border-[var(--hairline)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <input
                value={newStockTicker}
                onChange={(e) => setNewStockTicker(e.target.value)}
                placeholder="종목코드만 입력해도 OK"
                className="w-32 rounded-full border border-[var(--hairline)] bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                className="text-xs font-medium text-[var(--accent-text)]"
              >
                추가
              </button>
              <button
                type="button"
                onClick={() => setIsAddingStock(false)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)]"
              >
                취소
              </button>
            </form>
          ) : (
            <button
              onClick={() => setIsAddingStock(true)}
              className="rounded-full border border-dashed border-[var(--hairline)] px-3.5 py-1.5 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
            >
              + 종목 추가
            </button>
          )}
        </div>

        {/* 현재 종목 관리 */}
        <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            {isRenaming ? (
              <form
                onSubmit={submitRename}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  className="font-medium text-[var(--accent-text)]"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="hover:text-[var(--foreground)]"
                >
                  취소
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setRenameValue(activeStock.name);
                  setIsRenaming(true);
                }}
                className="underline underline-offset-2 hover:text-[var(--foreground)]"
              >
                종목명 변경
              </button>
            )}

            {isEditingTicker ? (
              <form
                onSubmit={submitTicker}
                className="flex items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={tickerValue}
                  onChange={(e) => setTickerValue(e.target.value)}
                  placeholder="예: 069500"
                  className="w-24 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1 text-xs outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  className="font-medium text-[var(--accent-text)]"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingTicker(false);
                    setTickerError(null);
                  }}
                  className="hover:text-[var(--foreground)]"
                >
                  취소
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setTickerValue(activeStock.ticker ?? "");
                  setIsEditingTicker(true);
                }}
                className="underline underline-offset-2 hover:text-[var(--foreground)]"
              >
                {activeStock.ticker
                  ? `종목 코드: ${activeStock.ticker}`
                  : "종목 코드 등록"}
              </button>
            )}
            {tickerError && (
              <span className="text-[var(--critical)]">{tickerError}</span>
            )}

            {stocks.length > 1 && (
              <button
                onClick={deleteActiveStock}
                className="underline underline-offset-2 hover:text-[var(--critical)]"
              >
                이 종목 삭제
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <IconButton title="엑셀로 내보내기" onClick={handleExportExcel}>
              <ExcelIcon />
            </IconButton>
            <IconButton title="백업 다운로드" onClick={handleBackupDownload}>
              <DownloadIcon />
            </IconButton>
            <IconButton
              title="백업 불러오기"
              onClick={() => backupInputRef.current?.click()}
            >
              <UploadIcon />
            </IconButton>
          </div>
        </div>

        <div className="flex w-full flex-col gap-6 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {/* 종목 요약 */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-[var(--accent)]" />
                <h2 className="text-base font-semibold tracking-tight">
                  {activeStock.name} 요약
                </h2>
                {activeQuote && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${
                      activeQuote.isRising
                        ? "bg-[var(--rise)]/10 text-[var(--rise)]"
                        : "bg-[var(--fall)]/10 text-[var(--fall)]"
                    }`}
                  >
                    {won(activeQuote.price)}
                    <span className="text-xs">
                      {activeQuote.isRising ? "▲" : "▼"}{" "}
                      {Math.abs(activeQuote.changeRatio).toFixed(2)}%
                    </span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label="보유수량"
                  value={`${summary.totalQty.toLocaleString("ko-KR")}주`}
                />
                <StatTile
                  label="총 매입금액"
                  value={won(summary.totalAmount)}
                />
                <StatTile
                  label="평단가"
                  value={won(summary.avgPrice)}
                  sub={
                    summary.totalQty > 0 && activeQuote
                      ? `현재가-평단가 ${priceGap >= 0 ? "+" : ""}${won(priceGap)}`
                      : undefined
                  }
                  subTone={
                    summary.totalQty > 0 && activeQuote
                      ? priceGap >= 0
                        ? "rise"
                        : "fall"
                      : undefined
                  }
                />
                <StatTile
                  label="평가손익"
                  value={
                    summary.totalQty > 0
                      ? `${profit >= 0 ? "+" : ""}${won(profit)}`
                      : "-"
                  }
                  sub={summary.totalQty > 0 ? pct(profitPercent) : undefined}
                  tone={
                    summary.totalQty > 0
                      ? profit >= 0
                        ? "rise"
                        : "fall"
                      : undefined
                  }
                />
                {summary.realizedProfit !== 0 && (
                  <StatTile
                    label="실현손익"
                    value={`${summary.realizedProfit >= 0 ? "+" : ""}${won(summary.realizedProfit)}`}
                    sub="매도로 확정된 손익"
                    tone={summary.realizedProfit >= 0 ? "rise" : "fall"}
                  />
                )}
              </div>
              {summary.totalQty > 0 && !activeQuote && (
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  실시간 시세가 없어 평단가 기준으로 계산했어요. 종목 코드를
                  등록하면 실시간 평가손익을 볼 수 있어요.
                </p>
              )}
            </section>

            {/* 오늘 매입 계산기 */}
            <TodayCalculator
              key={activeStock.id}
              stock={activeStock}
              liveState={
                activeStock.ticker ? quotes[activeStock.ticker] : undefined
              }
              summary={summary}
              onAdd={addToLog}
              onRefresh={refresh}
            />

            {/* 매수 기록 */}
            <CollapsibleSection id="trade-log" title="매수 기록">
              {activeStock.log.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  아직 기록이 없습니다.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-[var(--hairline)] text-left text-[var(--text-muted)]">
                        <th className="py-1.5 font-normal">날짜/시간</th>
                        <th className="py-1.5 font-normal">구분</th>
                        <th className="py-1.5 text-right font-normal">단가</th>
                        <th className="py-1.5 text-right font-normal">수량</th>
                        <th className="py-1.5 text-right font-normal">금액</th>
                        <th className="py-1.5 font-normal" />
                      </tr>
                    </thead>
                    <tbody>
                      {activeStock.log.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-[var(--hairline)]/60"
                        >
                          <td className="py-1.5">{entry.date}</td>
                          <td className="py-1.5">
                            <TradeTypeBadge type={entry.type} />
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {won(entry.price)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {entry.qty.toLocaleString("ko-KR")}주
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {won(entry.price * entry.qty)}
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              onClick={() => removeFromLog(entry.id)}
                              className="text-xs text-[var(--text-muted)] hover:text-[var(--critical)]"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsibleSection>

            {/* 시뮬레이션 표 */}
            <CollapsibleSection
              id="schedule"
              title="회차별 매수 스케줄 시뮬레이션"
            >
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="sticky top-0 bg-[var(--surface)]">
                    <tr className="border-b border-[var(--hairline)] text-left text-[var(--text-muted)]">
                      <th className="py-1.5 font-normal">회차</th>
                      <th className="py-1.5 font-normal">변동률</th>
                      <th className="py-1.5 text-right font-normal">
                        매입단가
                      </th>
                      <th className="py-1.5 text-right font-normal">
                        매입수량
                      </th>
                      <th className="py-1.5 text-right font-normal">
                        매입금액
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row) => (
                      <tr
                        key={row.round}
                        className="border-b border-[var(--hairline)]/60"
                      >
                        <td className="py-1.5 tabular-nums">{row.round}</td>
                        <td className="py-1.5">
                          <PhaseBadge
                            phase={row.phase}
                            changePercent={row.changePercent}
                          />
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {won(row.buyPrice)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {row.buyQty.toLocaleString("ko-KR")}주
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {won(row.buyAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </div>

          <aside className="flex w-full flex-col gap-3 xl:sticky xl:top-6 xl:w-80 xl:shrink-0">
            <CollapsibleSection
              id="settings"
              title="설정"
              defaultOpen={false}
              actions={
                <button
                  onClick={resetSettings}
                  className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--foreground)]"
                >
                  기본값으로 초기화
                </button>
              }
            >
              <div className="flex flex-col gap-4">
                {SETTINGS_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex flex-col gap-1.5 text-sm"
                  >
                    <span className="text-[var(--text-muted)]">
                      {field.label}
                    </span>
                    <input
                      type="number"
                      value={activeStock.settings[field.key]}
                      onChange={(e) =>
                        updateSetting(field.key, Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="default-settings"
              title="기본값 설정"
              defaultOpen={false}
              actions={
                <button
                  onClick={() => setDefaultSettings(DEFAULT_SETTINGS)}
                  className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--foreground)]"
                >
                  출고값으로 초기화
                </button>
              }
            >
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                새 종목을 추가하거나 종목의 &ldquo;기본값으로 초기화&rdquo;를
                누를 때 사용되는 값이에요.
              </p>
              <div className="flex flex-col gap-4">
                {SETTINGS_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex flex-col gap-1.5 text-sm"
                  >
                    <span className="text-[var(--text-muted)]">
                      {field.label}
                    </span>
                    <input
                      type="number"
                      value={defaultSettings[field.key]}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isNaN(value)) return;
                        setDefaultSettings((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }));
                      }}
                      className={inputClass}
                    />
                  </label>
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection id="trade-log-charts" title="매수 기록 그래프">
              <TradeLogCharts
                key={activeStock.id}
                log={activeStock.log}
                currentPrice={activeQuote?.price}
              />
            </CollapsibleSection>
          </aside>
        </div>
      </div>
    </div>
  );
}
