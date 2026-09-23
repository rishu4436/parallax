import { gapPct } from "./router";
import { etInstant, etParts } from "./session";
import type { FridayPrint } from "./types";

export interface FridayClose {
  ticker: string;
  close: number;
  sessionDate: string;
  source: string;
}

export interface SessionBar {
  ticker: string;
  open: number;
  close: number;
  sessionDate: string;
  source: string;
}

export interface TodayBar {
  open: number;
  close: number | null;
  sessionDate: string;
}

export interface CashPrints {
  ticker: string;
  source: string;
  /** Last completed Friday regular session. Weekend gap reference. */
  friday: SessionBar | null;
  /** Last completed regular session: yesterday on a weekday, Friday on a weekend. */
  prior: SessionBar | null;
  /** Today's regular open once the daily bar exists. Close is set only after 16:00 ET. */
  today: TodayBar | null;
}

export interface CashGaps {
  vsFriday: number | null;
  vsPriorClose: number | null;
  vsPriorOpen: number | null;
  vsSessionOpen: number | null;
}

export interface DailyBar {
  t: number;
  open: number;
  close: number;
}

interface YahooChart {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; open?: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
}

const SOURCE = "yahoo-chart-1d";

export function shortYmd(ymd: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return `${months[month - 1]} ${day}`;
}

export function cashPrintsFromBars(ticker: string, bars: DailyBar[], now = new Date()): CashPrints {
  const nowEt = etParts(now);
  let friday: SessionBar | null = null;
  let prior: SessionBar | null = null;
  let today: TodayBar | null = null;
  for (const bar of bars) {
    if (!(bar.open > 0) && !(bar.close > 0)) continue;
    const et = etParts(new Date(bar.t * 1000));
    const sessionDone = etInstant(et.year, et.month, et.day, 16, 0);
    const completed = sessionDone.getTime() <= now.getTime();
    if (et.ymd === nowEt.ymd && bar.open > 0) {
      today = { open: bar.open, close: completed && bar.close > 0 ? bar.close : null, sessionDate: et.ymd };
    }
    if (!completed || !(bar.open > 0) || !(bar.close > 0)) continue;
    const session: SessionBar = { ticker, open: bar.open, close: bar.close, sessionDate: et.ymd, source: SOURCE };
    if (!prior || et.ymd > prior.sessionDate) prior = session;
    if (et.weekday === 5 && (!friday || et.ymd > friday.sessionDate)) friday = session;
  }
  return { ticker, source: SOURCE, friday, prior, today };
}

export function cashGaps(perShare: number, cash: Pick<CashPrints, "friday" | "prior" | "today">): CashGaps {
  return {
    vsFriday: cash.friday ? gapPct(perShare, cash.friday.close) : null,
    vsPriorClose: cash.prior ? gapPct(perShare, cash.prior.close) : null,
    vsPriorOpen: cash.prior ? gapPct(perShare, cash.prior.open) : null,
    vsSessionOpen: cash.today ? gapPct(perShare, cash.today.open) : null,
  };
}

export async function fetchCashPrints(ticker: string, now = new Date()): Promise<CashPrints> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo&includePrePost=false`;
  const empty: CashPrints = { ticker, source: SOURCE, friday: null, prior: null, today: null };
  const res = await fetch(url, {
    headers: { "user-agent": "parallax/0.1", accept: "application/json" },
  });
  if (!res.ok) return empty;
  const body = (await res.json()) as YahooChart;
  const result = body.chart?.result?.[0];
  const stamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  const opens = result?.indicators?.quote?.[0]?.open;
  if (!stamps || !closes) return empty;
  const bars: DailyBar[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const close = closes[i];
    const open = opens?.[i];
    bars.push({
      t: stamps[i],
      open: typeof open === "number" ? open : 0,
      close: typeof close === "number" ? close : 0,
    });
  }
  return cashPrintsFromBars(ticker, bars, now);
}

/**
 * Official Friday cash close is the last completed Friday regular-session print.
 * Yahoo chart daily bars are the source. A missing print stays missing.
 */
export function fridayPrintFromCash(
  ticker: string,
  cash: CashPrints,
  storedAt = Date.now(),
): FridayPrint | null {
  if (!cash.friday && !cash.prior) return null;
  return {
    ticker,
    close: cash.friday?.close ?? cash.prior?.close ?? 0,
    sessionDate: cash.friday?.sessionDate ?? cash.prior?.sessionDate ?? "",
    source: cash.source,
    storedAt,
    open: cash.friday?.open,
    priorClose: cash.prior?.close,
    priorOpen: cash.prior?.open,
    priorDate: cash.prior?.sessionDate,
    sessionOpen: cash.today?.open,
    sessionOpenDate: cash.today?.sessionDate,
  };
}

export async function fetchFridayClose(ticker: string, now = new Date()): Promise<FridayClose | null> {
  const prints = await fetchCashPrints(ticker, now);
  if (!prints.friday) return null;
  return {
    ticker,
    close: prints.friday.close,
    sessionDate: prints.friday.sessionDate,
    source: prints.friday.source,
  };
}
