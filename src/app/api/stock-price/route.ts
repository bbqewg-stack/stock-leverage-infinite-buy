import { NextRequest, NextResponse } from "next/server";

// 네이버 금융의 공개 실시간 시세 API를 서버에서 대신 호출한다 (브라우저 CORS 우회 목적).
const NAVER_POLLING_URL = "https://polling.finance.naver.com/api/realtime/domestic/stock/";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "6자리 종목 코드를 입력하세요." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${NAVER_POLLING_URL}${code}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json({ error: "시세 조회 중 네트워크 오류가 발생했습니다." }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "시세 조회에 실패했습니다." }, { status: 502 });
  }

  const data = await upstream.json();
  const item = data?.datas?.[0];

  if (!item || item.closePriceRaw == null) {
    return NextResponse.json({ error: "해당 종목 코드를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    code,
    name: item.stockName as string,
    price: Number(item.closePriceRaw),
    changeRatio: Number(item.fluctuationsRatioRaw ?? 0),
    isRising: item.compareToPreviousPrice?.code === "2",
    marketStatus: item.marketStatus as string,
    updatedAt: item.localTradedAt as string,
  });
}
