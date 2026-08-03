// ACE 레버리지 무한매수법 계산 로직
// 원본 엑셀(ACE 레버리지 무한매수 TEST.xlsx)의 K3:Q43 수식을 그대로 옮긴 것:
//   매입단가 O = 기준단가 * (100 + N) / 100
//   상승구간 매수량 P = ROUND((1회투자금액 / O) * (매도기준율 - N) / 매도기준율, 0)
//   하락구간 매수량 P = ROUND((1회투자금액 / O) * (하락스케일 - N) / 하락스케일, 0)

export interface InfiniteBuySettings {
  basePrice: number; // 기준(1일차) 매수단가
  perOrderAmount: number; // 1회 평균 투자금액
  riseLimitPercent: number; // 매도 기준 상승률 (%)
  riseStepPercent: number; // 상승구간 회차당 변동폭 (%p)
  fallStepPercent: number; // 하락구간 회차당 변동폭 (%p)
  fallScale: number; // 하락구간 매수량 계산 분모
  totalRounds: number; // 총 시뮬레이션 회차 수
}

export const DEFAULT_SETTINGS: InfiniteBuySettings = {
  basePrice: 39800,
  perOrderAmount: 2000000,
  riseLimitPercent: 10,
  riseStepPercent: 1,
  fallStepPercent: 2,
  fallScale: 60,
  totalRounds: 50,
};

export interface ScheduleRow {
  round: number; // NO.
  changePercent: number; // 변동률 N (%p)
  phase: "rise" | "fall";
  buyPrice: number; // 매입단가 O
  buyQty: number; // 매입수량 P
  buyAmount: number; // 매입금액 Q
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

export function computeSchedule(settings: InfiniteBuySettings): ScheduleRow[] {
  const {
    basePrice,
    perOrderAmount,
    riseLimitPercent,
    riseStepPercent,
    fallStepPercent,
    fallScale,
    totalRounds,
  } = settings;

  const riseRounds = Math.floor(riseLimitPercent / riseStepPercent) + 1;
  const rows: ScheduleRow[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const phase: "rise" | "fall" = round <= riseRounds ? "rise" : "fall";
    const changePercent =
      phase === "rise"
        ? (round - 1) * riseStepPercent
        : -(round - riseRounds) * fallStepPercent;

    const buyPrice = (basePrice * (100 + changePercent)) / 100;
    const weight =
      phase === "rise"
        ? (riseLimitPercent - changePercent) / riseLimitPercent
        : (fallScale - changePercent) / fallScale;
    const buyQty = Math.max(
      0,
      roundHalfUp((perOrderAmount / buyPrice) * weight),
    );
    const buyAmount = buyPrice * buyQty;

    rows.push({ round, changePercent, phase, buyPrice, buyQty, buyAmount });
  }

  return rows;
}

export interface TodaySuggestion {
  changePercent: number; // 기준단가 대비 변동률(%)
  phase: "rise" | "fall";
  buyQty: number;
  buyAmount: number;
}

export function computeTodaySuggestion(
  todayPrice: number,
  settings: InfiniteBuySettings,
): TodaySuggestion {
  const { basePrice, perOrderAmount, riseLimitPercent, fallScale } = settings;
  const changePercent = (todayPrice / basePrice - 1) * 100;
  const phase: "rise" | "fall" = changePercent >= 0 ? "rise" : "fall";
  const weight =
    phase === "rise"
      ? (riseLimitPercent - changePercent) / riseLimitPercent
      : (fallScale - changePercent) / fallScale;
  const buyQty = Math.max(
    0,
    roundHalfUp((perOrderAmount / todayPrice) * weight),
  );
  const buyAmount = todayPrice * buyQty;

  return { changePercent, phase, buyQty, buyAmount };
}

export interface TradeLogEntry {
  id: string;
  date: string; // YYYY-MM-DD HH:mm
  type?: "buy" | "sell"; // 없으면 매수(과거 기록과의 호환)
  price: number;
  qty: number;
}

export interface TradeLogSummary {
  totalQty: number;
  totalAmount: number;
  avgPrice: number;
  realizedProfit: number; // 매도로 실현된 손익 누적 (가중평균 매입단가 기준)
}

// 매도는 매도 시점의 가중평균 매입단가를 기준으로 원가를 덜어내고, 그 차액을
// 실현손익으로 누적한다 — 남은 보유분의 평단가는 매도로 인해 바뀌지 않는다.
export function summarizeTradeLog(entries: TradeLogEntry[]): TradeLogSummary {
  let totalQty = 0;
  let totalAmount = 0;
  let realizedProfit = 0;

  for (const entry of entries) {
    if (entry.type === "sell") {
      const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;
      const sellQty = Math.min(entry.qty, totalQty);
      realizedProfit += sellQty * (entry.price - avgPrice);
      totalQty -= sellQty;
      totalAmount -= sellQty * avgPrice;
    } else {
      totalQty += entry.qty;
      totalAmount += entry.price * entry.qty;
    }
  }

  const avgPrice = totalQty > 0 ? totalAmount / totalQty : 0;
  return { totalQty, totalAmount, avgPrice, realizedProfit };
}

// 종목별로 설정과 매수 기록을 독립적으로 관리하기 위한 단위
export interface Stock {
  id: string;
  name: string; // 종목명 (예: ACE 레버리지)
  ticker?: string; // 네이버 금융 종목코드 (국내 6자리 또는 해외 .INX/AAPL.O 형식, 실시간 시세 조회용)
  settings: InfiniteBuySettings;
  log: TradeLogEntry[];
}

export function createStock(
  name: string,
  settings: InfiniteBuySettings = DEFAULT_SETTINGS,
  ticker?: string,
): Stock {
  return {
    id: crypto.randomUUID(),
    name,
    ticker,
    settings,
    log: [],
  };
}
