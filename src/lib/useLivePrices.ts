"use client";

// 등록된 종목 코드들의 실시간 시세를 주기적으로(기본 15초) 폴링해 공유하는 훅.
// 계산기 페이지의 좌측 시세 패널과 대시보드가 같은 폴링 결과를 나눠 쓴다.

import { useCallback, useEffect, useRef, useState } from "react";

export interface LiveQuote {
  name: string;
  price: number;
  changeRatio: number;
  isRising: boolean;
  marketStatus: string;
  updatedAt: string;
}

export interface LiveQuoteState {
  quote?: LiveQuote;
  error?: string;
  loading: boolean;
}

const DEFAULT_INTERVAL_MS = 15000;

export function useLivePrices(
  tickers: string[],
  intervalMs: number = DEFAULT_INTERVAL_MS,
) {
  const uniqueTickers = Array.from(new Set(tickers.filter(Boolean))).sort();
  const tickersKey = uniqueTickers.join(",");
  const [quotes, setQuotes] = useState<Record<string, LiveQuoteState>>({});

  const fetchQuotes = useCallback(async (codes: string[]) => {
    if (codes.length === 0) return;
    setQuotes((prev) => {
      const next = { ...prev };
      for (const code of codes) next[code] = { ...next[code], loading: true };
      return next;
    });

    await Promise.all(
      codes.map(async (code) => {
        try {
          const res = await fetch(`/api/stock-price?code=${code}`, {
            cache: "no-store",
          });
          const data = await res.json();
          if (!res.ok)
            throw new Error(data.error ?? "시세 조회에 실패했습니다.");
          setQuotes((prev) => ({
            ...prev,
            [code]: {
              loading: false,
              quote: {
                name: data.name,
                price: data.price,
                changeRatio: data.changeRatio,
                isRising: data.isRising,
                marketStatus: data.marketStatus,
                updatedAt: data.updatedAt,
              },
            },
          }));
        } catch (err) {
          setQuotes((prev) => ({
            ...prev,
            [code]: {
              loading: false,
              quote: prev[code]?.quote,
              error:
                err instanceof Error
                  ? err.message
                  : "시세 조회에 실패했습니다.",
            },
          }));
        }
      }),
    );
  }, []);

  const fetchQuotesRef = useRef(fetchQuotes);
  fetchQuotesRef.current = fetchQuotes;

  useEffect(() => {
    const codes = tickersKey ? tickersKey.split(",") : [];
    if (codes.length === 0) return;
    fetchQuotesRef.current(codes);
    const id = setInterval(() => fetchQuotesRef.current(codes), intervalMs);
    return () => clearInterval(id);
  }, [tickersKey, intervalMs]);

  const refresh = useCallback(() => {
    const codes = tickersKey ? tickersKey.split(",") : [];
    return fetchQuotes(codes);
  }, [tickersKey, fetchQuotes]);

  return { quotes, refresh };
}
