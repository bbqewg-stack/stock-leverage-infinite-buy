// 종목 목록을 localStorage에서 읽고 쓰는 공통 로직.
// 계산기 페이지와 대시보드 페이지가 같은 저장소를 바라보기 위해 분리했다.

import {
  DEFAULT_SETTINGS,
  InfiniteBuySettings,
  Stock,
  TradeLogEntry,
  createStock,
} from "./infiniteBuy";

export const STOCKS_KEY = "infinite-buy:stocks";
export const ACTIVE_KEY = "infinite-buy:active-id";
// 이전 단일 종목 버전에서 쓰던 키 (있으면 첫 종목으로 이전)
const LEGACY_SETTINGS_KEY = "infinite-buy:settings";
const LEGACY_LOG_KEY = "infinite-buy:log";

export function loadJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadStocks(): Stock[] {
  const savedStocks = loadJSON<Stock[] | null>(STOCKS_KEY, null);
  if (savedStocks && savedStocks.length > 0) return savedStocks;

  const legacySettings = loadJSON<InfiniteBuySettings | null>(
    LEGACY_SETTINGS_KEY,
    null,
  );
  const legacyLog = loadJSON<TradeLogEntry[]>(LEGACY_LOG_KEY, []);
  const stock = createStock("ACE 레버리지", legacySettings ?? DEFAULT_SETTINGS);
  stock.log = legacyLog;
  return [stock];
}

// 서버(DB)에 저장된 상태. 브라우저 저장소가 초기화되어도 여기서 복구한다.
export interface RemoteState {
  stocks: Stock[];
  activeId: string;
}

// "서버에 데이터가 없음"과 "서버에 연결하지 못함"을 반드시 구분해야 한다.
// 둘 다 그냥 null로 합쳐버리면, 일시적인 네트워크 오류가 났을 때도 자동저장이
// 켜져서 로컬의 빈/기본 상태로 서버의 진짜 데이터를 덮어써버릴 수 있다.
export type RemoteFetchResult =
  { ok: true; state: RemoteState | null } | { ok: false };

export async function fetchRemoteState(): Promise<RemoteFetchResult> {
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data.stocks || !data.activeId) return { ok: true, state: null };
    return { ok: true, state: data as RemoteState };
  } catch {
    return { ok: false };
  }
}

export async function saveRemoteState(
  stocks: Stock[],
  activeId: string,
): Promise<void> {
  try {
    await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stocks, activeId }),
    });
  } catch {
    // 네트워크 오류는 조용히 무시 — localStorage가 여전히 로컬 백업 역할을 한다.
  }
}
