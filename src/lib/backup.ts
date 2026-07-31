import { Stock } from "./infiniteBuy";

export interface BackupFile {
  stocks: Stock[];
  activeId: string;
  exportedAt: string;
}

export function downloadBackup(stocks: Stock[], activeId: string) {
  const payload: BackupFile = {
    stocks,
    activeId,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `infinite-buy-backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(
  file: File,
): Promise<{ stocks: Stock[]; activeId: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!Array.isArray(data.stocks) || data.stocks.length === 0) {
          throw new Error("올바른 백업 파일이 아닙니다.");
        }
        const activeId =
          typeof data.activeId === "string" &&
          data.stocks.some((s: Stock) => s.id === data.activeId)
            ? data.activeId
            : data.stocks[0].id;
        resolve({ stocks: data.stocks, activeId });
      } catch {
        reject(
          new Error(
            "백업 파일을 읽는 중 오류가 발생했습니다. 파일 형식을 확인해주세요.",
          ),
        );
      }
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsText(file);
  });
}
