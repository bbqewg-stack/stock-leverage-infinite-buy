import { NextRequest, NextResponse } from "next/server";
import { detectMarketType, type MarketType } from "@/lib/tickerCode";

// 국내 종목: 네이버 금융의 공개 실시간 시세 API를 서버에서 대신 호출 (브라우저 CORS 우회 목적).
const NAVER_DOMESTIC_URL =
  "https://polling.finance.naver.com/api/realtime/domestic/stock/";
// 해외 지수/종목: 네이버 증권 앱이 쓰는 API. 국내와 응답 구조가 달라 별도 파싱이 필요하다.
const NAVER_WORLD_INDEX_URL = "https://api.stock.naver.com/index/";
const NAVER_WORLD_STOCK_URL = "https://api.stock.naver.com/stock/";

interface Quote {
  name: string;
  price: number;
  changeRatio: number;
  isRising: boolean;
  marketStatus: string;
  updatedAt: string;
}

async function fetchDomestic(code: string): Promise<Quote | null> {
  const upstream = await fetch(`${NAVER_DOMESTIC_URL}${code}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const item = data?.datas?.[0];
  if (!item || item.closePriceRaw == null) return null;

  const changeRatio = Number(item.fluctuationsRatioRaw ?? 0);
  return {
    name: item.stockName as string,
    price: Number(item.closePriceRaw),
    changeRatio,
    // compareToPreviousPrice.code는 "1"(상한)도 상승인데 "2"(상승)만 확인하면
    // 상한가 종목이 하락으로 잘못 표시된다. 등락률 부호로 직접 판단한다.
    isRising: changeRatio >= 0,
    marketStatus: item.marketStatus as string,
    updatedAt: item.localTradedAt as string,
  };
}

async function fetchWorld(
  code: string,
  kind: "worldIndex" | "worldStock",
): Promise<Quote | null> {
  const base =
    kind === "worldIndex" ? NAVER_WORLD_INDEX_URL : NAVER_WORLD_STOCK_URL;
  const upstream = await fetch(`${base}${encodeURIComponent(code)}/basic`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return null;
  const data = await upstream.json();
  // 실패 응답은 최상위에 code: "StockConflict" 같은 에러 코드가 온다 (성공 응답에는 없음).
  if (!data || data.code || data.closePrice == null) return null;

  const price = Number(String(data.closePrice).replace(/,/g, ""));
  const changeRatio = Number(String(data.fluctuationsRatio).replace(/,/g, ""));
  if (Number.isNaN(price)) return null;

  return {
    name: (data.stockName ?? data.indexName ?? code) as string,
    price,
    changeRatio: Number.isNaN(changeRatio) ? 0 : changeRatio,
    isRising: changeRatio >= 0,
    marketStatus: data.marketStatus as string,
    updatedAt: data.localTradedAt as string,
  };
}

// 해외 코드는 지수(.INX)/종목(AAPL.O) 중 어느 쪽인지 코드 모양으로 먼저 짐작해 호출하고,
// 짐작이 틀렸을 때만(드묾) 반대쪽으로 한 번 더 시도한다 — 매 폴링마다 이중 조회하지 않기 위함.
async function fetchWorldWithFallback(
  code: string,
  guess: "worldIndex" | "worldStock",
): Promise<Quote | null> {
  const primary = await fetchWorld(code, guess);
  if (primary) return primary;
  const fallback = guess === "worldIndex" ? "worldStock" : "worldIndex";
  return fetchWorld(code, fallback);
}

export async function GET(request: NextRequest) {
  // 네이버 해외 API는 대소문자를 구분한다(".inx"는 실패, ".INX"만 성공) — 국내
  // 6자리 코드는 숫자뿐이라 영향이 없으므로 항상 대문자로 정규화해도 안전하다.
  const code = request.nextUrl.searchParams.get("code")?.toUpperCase() ?? null;
  const marketType: MarketType | null = code ? detectMarketType(code) : null;

  if (!code || !marketType) {
    return NextResponse.json(
      {
        error:
          "종목 코드를 확인하세요. 국내는 6자리 숫자(예: 005930), 해외는 .INX / AAPL.O 형식이에요.",
      },
      { status: 400 },
    );
  }

  let quote: Quote | null;
  try {
    quote =
      marketType === "domestic"
        ? await fetchDomestic(code)
        : await fetchWorldWithFallback(code, marketType);
  } catch {
    return NextResponse.json(
      { error: "시세 조회 중 네트워크 오류가 발생했습니다." },
      { status: 502 },
    );
  }

  if (!quote) {
    return NextResponse.json(
      { error: "해당 종목 코드를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return NextResponse.json({ code, ...quote });
}
