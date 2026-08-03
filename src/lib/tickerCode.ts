// 네이버 금융에서 쓰는 종목 코드 형식 판별.
// - 국내: 6자리 숫자 (예: 005930)
// - 해외 지수: 점(.)으로 시작 (예: .INX = S&P 500, .DJI = 다우, .IXIC = 나스닥종합)
//   네이버 증권 해외지수 페이지 URL(m.stock.naver.com/worldstock/index/.INX)에 그대로 노출되는 코드.
// - 해외 종목: "심볼.거래소코드" 형식 (예: AAPL.O = 애플, TSLA.O = 테슬라)
export type MarketType = "domestic" | "worldIndex" | "worldStock";

const DOMESTIC_CODE = /^\d{6}$/;
const WORLD_INDEX_CODE = /^\.[A-Za-z0-9]{2,10}$/;
const WORLD_STOCK_CODE = /^[A-Za-z0-9]{1,10}\.[A-Za-z]{1,3}$/;

export function detectMarketType(code: string): MarketType | null {
  if (DOMESTIC_CODE.test(code)) return "domestic";
  if (WORLD_INDEX_CODE.test(code)) return "worldIndex";
  if (WORLD_STOCK_CODE.test(code)) return "worldStock";
  return null;
}

export function isValidTickerCode(code: string): boolean {
  return detectMarketType(code) !== null;
}
