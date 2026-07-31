import { NextRequest, NextResponse } from "next/server";
import { initDb, query } from "@/lib/db";
import { Stock } from "@/lib/infiniteBuy";

// 종목 목록 + 현재 선택된 종목을 하나의 JSON 값으로 저장/조회한다.
// (localStorage와 동일한 모양을 그대로 DB에 옮겨서 마이그레이션 비용을 줄였다.)
const STATE_KEY = "infinite-buy";

interface AppState {
  stocks: Stock[];
  activeId: string;
}

export async function GET() {
  await initDb();
  const result = await query("SELECT value FROM app_state WHERE key = $1", [
    STATE_KEY,
  ]);
  if (result.rows.length === 0) {
    return NextResponse.json({ stocks: null, activeId: null });
  }
  return NextResponse.json(result.rows[0].value as AppState);
}

export async function PUT(request: NextRequest) {
  await initDb();
  const body = (await request.json()) as AppState;

  await query(
    `INSERT INTO app_state (key, value, updated_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    [
      STATE_KEY,
      JSON.stringify({ stocks: body.stocks, activeId: body.activeId }),
    ],
  );

  return NextResponse.json({ ok: true });
}
