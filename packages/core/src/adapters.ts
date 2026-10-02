/**
 * Desk adapters. UI talks to these shapes. Live implementations live in @parallax/web3.
 * Demo overlays never replace a live adapter; they are labeled DEMO DATA in the UI.
 */
export interface ReferencePrint {
  price: number | null;
  sessionDate: string | null;
  source: string;
  at: number;
}

export interface TokenizedPrint {
  symbol: string;
  perShare: number | null;
  tokenPrice: number | null;
  liquidity: number;
  isMarketOpen: boolean | null;
  source: string;
  at: number;
}

export interface QuoteSnap {
  ok: boolean;
  perShare: number;
  slipBps50: number;
  slipKnown: boolean;
  gasUsd: number;
  vendor?: string;
  mode?: string;
  quoteExpiresAt: number;
  source: "binance-web3-trading";
}

export interface DeskAdapters {
  getReferencePrice(ticker: string): Promise<ReferencePrint>;
  getTokenizedPrice(contractAddress: string): Promise<TokenizedPrint>;
  getMarketStatus(): Promise<{ cashOpen: boolean; chainOpen: boolean; label: string }>;
  getQuote(ticker: string, usdt: string, wallet: string): Promise<QuoteSnap | null>;
}
