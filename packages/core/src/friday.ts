import { gapPct } from "./router";
import { NYSE_HOLIDAYS_2026, etInstant, etParts } from "./session";
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
const STOOQ_SOURCE = "stooq-daily";
export const RWA_MARKET_SOURCE = "binance-rwa-underlying-market";
export const RWA_PRICE_SOURCE = "binance-rwa-price";
const PRINT_TTL_MS = 5 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdFromOffset(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function isBusinessYmd(ymd: string, weekday: number): boolean {
  if (weekday === 0 || weekday === 6) return false;
  return !NYSE_HOLIDAYS_2026.has(ymd);
}

/** Last regular session that has already printed a 16:00 ET close. */
export function lastCompletedBusinessYmd(now = new Date()): string {
  const et = etParts(now);
  const todayClose = etInstant(et.year, et.month, et.day, 16, 0);
  if (isBusinessYmd(et.ymd, et.weekday) && todayClose.getTime() <= now.getTime()) return et.ymd;
  for (let i = 1; i <= 12; i++) {
    const ymd = ymdFromOffset(et.ymd, -i);
    const [year, month, day] = ymd.split("-").map(Number);
    const weekday = etParts(etInstant(year, month, day, 12, 0)).weekday;
    if (isBusinessYmd(ymd, weekday)) return ymd;
  }
  return et.ymd;
}

/** Last Friday whose regular session has closed. Null only if the clock is still inside that Friday. */
export function lastFridayYmd(now = new Date()): string | null {
  const et = etParts(now);
  for (let i = 0; i <= 12; i++) {
    const ymd = ymdFromOffset(et.ymd, -i);
    const [year, month, day] = ymd.split("-").map(Number);
    const close = etInstant(year, month, day, 16, 0);
    if (etParts(close).weekday !== 5) continue;
    if (close.getTime() > now.getTime()) continue;
    return ymd;
  }
  return null;
}

export interface RwaMarketPrint {
  previousClose: number | null;
  open: number | null;
  last: number | null;
  referencePrice: number | null;
}

/**
 * Map Binance RWA underlying-market fields onto cash session bars.
 * `previousClose` is the last completed regular session. On a weekend that session is Friday,
 * so friday and prior are the same print.
 */
export function cashPrintsFromRwaMarket(
  ticker: string,
  market: RwaMarketPrint,
  now = new Date(),
  source = RWA_MARKET_SOURCE,
): CashPrints {
  const symbol = ticker.trim().toUpperCase();
  const et = etParts(now);
  const priorClose = market.previousClose;
  const priorDate = lastCompletedBusinessYmd(now);
  const fridayDate = lastFridayYmd(now);
  const sessionOpen = market.open && market.open > 0 ? market.open : null;
  const prior: SessionBar | null =
    priorClose && priorClose > 0
      ? {
          ticker: symbol,
          open: priorDate === et.ymd && sessionOpen ? sessionOpen : priorClose,
          close: priorClose,
          sessionDate: priorDate,
          source,
        }
      : null;
  const friday: SessionBar | null = prior && fridayDate && priorDate === fridayDate ? { ...prior, sessionDate: fridayDate } : null;
  const todayIsBusiness = isBusinessYmd(et.ymd, et.weekday);
  const today: TodayBar | null =
    todayIsBusiness && sessionOpen && et.ymd !== priorDate
      ? { open: sessionOpen, close: null, sessionDate: et.ymd }
      : prior && prior.sessionDate === et.ymd
        ? { open: prior.open, close: prior.close, sessionDate: et.ymd }
        : null;
  return { ticker: symbol, source, friday, prior, today };
}

/** Cash underlyings the desk can price against a Friday 16:00 ET close. */
export const TRADFI_UNDERLYINGS = ["NVDA", "TSLA", "AAPL", "AMZN", "MSFT", "META", "GOOGL", "AMD", "QQQ", "SPY", "CRCL"] as const;

const printCache = new Map<string, { at: number; prints: CashPrints }>();

export function shortYmd(ymd: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return `${months[month - 1]} ${day}`;
}

export function cashPrintsFromBars(ticker: string, bars: DailyBar[], now = new Date(), source = SOURCE): CashPrints {
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
    const session: SessionBar = { ticker, open: bar.open, close: bar.close, sessionDate: et.ymd, source };
    if (!prior || et.ymd > prior.sessionDate) prior = session;
    if (et.weekday === 5 && (!friday || et.ymd > friday.sessionDate)) friday = session;
  }
  return { ticker, source, friday, prior, today };
}

export function cashGaps(perShare: number, cash: Pick<CashPrints, "friday" | "prior" | "today">): CashGaps {
  return {
    vsFriday: cash.friday ? gapPct(perShare, cash.friday.close) : null,
    vsPriorClose: cash.prior ? gapPct(perShare, cash.prior.close) : null,
    vsPriorOpen: cash.prior ? gapPct(perShare, cash.prior.open) : null,
    vsSessionOpen: cash.today ? gapPct(perShare, cash.today.open) : null,
  };
}

export function barsFromYahooChart(body: YahooChart): DailyBar[] {
  const result = body.chart?.result?.[0];
  const stamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  const opens = result?.indicators?.quote?.[0]?.open;
  if (!stamps || !closes) return [];
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
  return bars;
}

/** Stooq daily CSV. Each row is stamped at 16:00 America/New_York so the session date stays on that cash day. */
export function barsFromStooqCsv(csv: string): DailyBar[] {
  const bars: DailyBar[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const [date, open, , , close] = line.split(",");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const [year, month, day] = date.split("-").map(Number);
    const o = Number(open);
    const c = Number(close);
    if (!year || !month || !day || !(c > 0)) continue;
    bars.push({
      t: Math.floor(etInstant(year, month, day, 16, 0).getTime() / 1000),
      open: o > 0 ? o : 0,
      close: c,
    });
  }
  return bars.slice(-40);
}

export function mergePrints(primary: CashPrints, fallback: CashPrints): CashPrints {
  const friday = primary.friday ?? fallback.friday;
  const prior = primary.prior ?? fallback.prior;
  const today = primary.today ?? fallback.today;
  const source = primary.friday ? primary.source : fallback.friday ? fallback.source : primary.prior ? primary.source : fallback.source;
  return { ticker: primary.ticker, source, friday, prior, today };
}

async function fetchYahooBars(ticker: string): Promise<DailyBar[]> {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    accept: "application/json",
  };
  for (const host of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1mo&includePrePost=false`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const bars = barsFromYahooChart((await res.json()) as YahooChart);
      if (bars.length) return bars;
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchStooqBars(ticker: string): Promise<DailyBar[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(ticker.toLowerCase())}.us&i=d`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "parallax/0.1", accept: "text/csv" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    return barsFromStooqCsv(await res.text());
  } catch {
    return [];
  }
}

export async function fetchCashPrints(ticker: string, now = new Date()): Promise<CashPrints> {
  const symbol = ticker.trim().toUpperCase();
  const empty: CashPrints = { ticker: symbol, source: SOURCE, friday: null, prior: null, today: null };
  const liveClock = Math.abs(now.getTime() - Date.now()) < 60_000;
  const cached = printCache.get(symbol);
  if (liveClock && cached && Date.now() - cached.at < PRINT_TTL_MS && (cached.prints.friday || cached.prints.prior)) {
    return cached.prints;
  }
  const yahoo = cashPrintsFromBars(symbol, await fetchYahooBars(symbol), now, SOURCE);
  let prints = yahoo;
  if (!yahoo.friday || !yahoo.prior) {
    const stooq = cashPrintsFromBars(symbol, await fetchStooqBars(symbol), now, STOOQ_SOURCE);
    prints = mergePrints(yahoo, stooq);
  }
  if (!prints.friday && !prints.prior) prints = empty;
  if (liveClock && (prints.friday || prints.prior)) printCache.set(symbol, { at: Date.now(), prints });
  return prints;
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
