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
