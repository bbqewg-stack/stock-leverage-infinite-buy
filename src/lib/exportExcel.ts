import * as XLSX from "xlsx";
import { ScheduleRow, Stock } from "./infiniteBuy";

export function exportStockToExcel(stock: Stock, schedule: ScheduleRow[]) {
  const wb = XLSX.utils.book_new();

  const wsSettings = XLSX.utils.aoa_to_sheet([
    ["항목", "값"],
    ["기준(1일차) 매수단가", stock.settings.basePrice],
    ["1회 평균 투자금액", stock.settings.perOrderAmount],
    ["매도 기준 상승률(%)", stock.settings.riseLimitPercent],
    ["상승구간 회차당 변동폭(%p)", stock.settings.riseStepPercent],
    ["하락구간 회차당 변동폭(%p)", stock.settings.fallStepPercent],
    ["하락구간 계산 분모", stock.settings.fallScale],
    ["총 시뮬레이션 회차 수", stock.settings.totalRounds],
  ]);
  XLSX.utils.book_append_sheet(wb, wsSettings, "설정");

  const wsLog = XLSX.utils.json_to_sheet(
    stock.log.map((e) => ({
      날짜: e.date,
      매입단가: e.price,
      매수량: e.qty,
      매입금액: e.price * e.qty,
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsLog, "매수 기록");

  const wsSchedule = XLSX.utils.json_to_sheet(
    schedule.map((r) => ({
      회차: r.round,
      구간: r.phase === "rise" ? "상승" : "하락",
      변동률: r.changePercent,
      매입단가: Math.round(r.buyPrice),
      매입수량: r.buyQty,
      매입금액: Math.round(r.buyAmount),
    })),
  );
  XLSX.utils.book_append_sheet(wb, wsSchedule, "매수 스케줄");

  const safeName = stock.name.replace(/[\\/:*?"<>|]/g, "_");
  XLSX.writeFile(
    wb,
    `${safeName}_무한매수_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
