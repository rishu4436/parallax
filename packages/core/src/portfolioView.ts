import { gapPct } from "./router";
import type { Rail, TapeRow } from "./types";

const STABLES = new Set(["USDT", "USDC", "USD1"]);

export type HoldingStatus = "TRACKED" | "UNVALUED" | "UNKNOWN";

export interface PortfolioBalanceLine {
  symbol: string;
  address: string;
  rail?: Rail;
  ticker?: string;
  amount: number;
  multiplier?: number | null;
}

export interface PortfolioQuote {
  ticker: string;
  rail: Rail;
  symbol: string;
  perShare: number;
  reference: number;
  quoteExpiresAt?: number | null;
}

export interface PortfolioHoldingView {
  symbol: string;
  address: string;
  ticker: string | null;
  name: string | null;
  rail: Rail | null;
  amount: number;
  multiplier: number | null;
  shareEquivalent: number | null;
  perShare: number | null;
  reference: number | null;
  valueUsd: number | null;
  quoteExpiresAt: number | null;
  gapPct: number | null;
  status: HoldingStatus;
}

export interface PortfolioUnderlyingView {
  ticker: string;
  name: string;
  rails: PortfolioHoldingView[];
  combinedShares: number | null;
  combinedValueUsd: number | null;
}

export interface PortfolioValuationView {
  partial: boolean;
  valuedUsd: number | null;
  valuedCount: number;
  unvaluedCount: number;
}

export interface PortfolioView {
  connected: boolean;
  equity: PortfolioHoldingView[];
  groups: PortfolioUnderlyingView[];
  stables: PortfolioHoldingView[];
  other: PortfolioHoldingView[];
  valuation: PortfolioValuationView;
  watchlist: PortfolioHoldingView[];
}

export function walletPhase(connected: boolean): "CONNECTED" | "DISCONNECTED" {
  return connected ? "CONNECTED" : "DISCONNECTED";
}

export function portfolioLayout(width: number): "stack" | "table" {
  return width >= 900 ? "table" : "stack";
}

export function marketHref(ticker: string): string {
  return `/markets/${encodeURIComponent(ticker)}`;
}

export function opportunityHref(ticker: string): string {
  return `/opportunities?ticker=${encodeURIComponent(ticker)}`;
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function holdingFromLine(line: PortfolioBalanceLine, quote?: PortfolioQuote, name?: string | null): PortfolioHoldingView {
  const equity = Boolean(line.ticker && line.rail);
  const stable = STABLES.has(line.symbol.toUpperCase());
  const multiplier = positive(line.multiplier);
  const perShare = positive(quote?.perShare);
  const reference = positive(quote?.reference);
  const valueUsd = equity && perShare != null && multiplier != null ? line.amount * perShare * multiplier : null;
  const status: HoldingStatus = !equity && !stable ? "UNKNOWN" : valueUsd == null && equity ? "UNVALUED" : equity ? "TRACKED" : "TRACKED";
  return {
    symbol: line.symbol,
    address: line.address,
    ticker: equity ? line.ticker || null : null,
    name: equity ? name || null : null,
    rail: equity ? line.rail || null : null,
    amount: line.amount,
    multiplier,
    shareEquivalent: equity && multiplier != null ? line.amount * multiplier : null,
    perShare,
    reference,
    valueUsd,
    quoteExpiresAt: quote?.quoteExpiresAt ?? null,
    gapPct: perShare != null ? gapPct(perShare, reference) : null,
    status: stable ? "TRACKED" : status,
  };
}

export function buildPortfolio(input: {
  connected: boolean;
  lines: PortfolioBalanceLine[];
  names?: Record<string, string>;
  quotes?: PortfolioQuote[];
}): PortfolioView {
  if (!input.connected) {
    return { connected: false, equity: [], groups: [], stables: [], other: [], valuation: { partial: false, valuedUsd: null, valuedCount: 0, unvaluedCount: 0 }, watchlist: [] };
  }
  const quotes = input.quotes || [];
  const held = input.lines.filter((line) => line.amount > 0);
  const views = held.map((line) => {
    const quote = line.ticker && line.rail ? quotes.find((item) => item.ticker === line.ticker && item.rail === line.rail && item.symbol === line.symbol) : undefined;
    return holdingFromLine(line, quote, line.ticker ? input.names?.[line.ticker] : null);
  });
  const equity = views.filter((row) => row.ticker && row.rail);
  const stables = views.filter((row) => !row.ticker && STABLES.has(row.symbol.toUpperCase()));
  const other = views.filter((row) => !equity.includes(row) && !stables.includes(row));
  const groups = groupEquity(equity);
  const unvalued = equity.filter((row) => row.valueUsd == null);
  const valued = equity.filter((row) => row.valueUsd != null);
  return {
    connected: true,
    equity,
    groups,
    stables,
    other,
    valuation: {
      partial: unvalued.length > 0 || stables.length > 0 || other.length > 0,
      valuedUsd: valued.length ? valued.reduce((sum, row) => sum + (row.valueUsd || 0), 0) : null,
      valuedCount: valued.length,
      unvaluedCount: unvalued.length,
    },
    watchlist: equity.filter((row) => row.perShare != null),
  };
}

function groupEquity(rows: PortfolioHoldingView[]): PortfolioUnderlyingView[] {
  const map = new Map<string, PortfolioHoldingView[]>();
  for (const row of rows) {
    if (!row.ticker) continue;
    const list = map.get(row.ticker) || [];
    list.push(row);
    map.set(row.ticker, list);
  }
  return [...map.entries()].map(([ticker, rails]) => {
    const sharesKnown = rails.every((row) => row.shareEquivalent != null);
    const valuesKnown = rails.every((row) => row.valueUsd != null);
    return {
      ticker,
      name: rails.find((row) => row.name)?.name || ticker,
      rails,
      combinedShares: sharesKnown ? rails.reduce((sum, row) => sum + (row.shareEquivalent || 0), 0) : null,
      combinedValueUsd: valuesKnown ? rails.reduce((sum, row) => sum + (row.valueUsd || 0), 0) : null,
    };
  });
}

export function executionsForTickers(rows: TapeRow[], tickers: string[]): TapeRow[] {
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  if (!wanted.size) return [];
  return rows.filter((row) => wanted.has(row.ticker.toUpperCase()));
}
