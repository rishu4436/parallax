import { getAddress } from "viem";
import {
  RWA_MARKET_SOURCE,
  RWA_PRICE_SOURCE,
  cashPrintsFromRwaMarket,
  cashSession,
  fetchCashPrints,
  mergePrints,
  RWA_LIST_URL,
  type CashPrints,
  type LiveListRow,
  type Wrapper,
} from "@parallax/core";
import { readEnv } from "@parallax/config";
import { web3Fetch } from "./client";

const HEADERS = {
  accept: "application/json",
  "accept-encoding": "identity",
  "user-agent": "parallax/0.1",
};

export async function fetchRwaList(type: 1 | 2 | 3): Promise<LiveListRow[]> {
  const res = await fetch(`${RWA_LIST_URL}?type=${type}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`RWA list type=${type} HTTP ${res.status}`);
  const body = (await res.json()) as { data?: LiveListRow[]; success?: boolean; message?: string };
  if (!body.data) throw new Error(body.message || `RWA list type=${type} returned no data`);
  return body.data;
}

export async function fetchAllRwaLists(): Promise<LiveListRow[]> {
  const pages = await Promise.all([fetchRwaList(1), fetchRwaList(2), fetchRwaList(3)]);
  return pages.flat();
}

export interface DynamicSnap {
  price: number | null;
  multiplier: number | null;
  stockPrice: number | null;
  previousClose: number | null;
  open: number | null;
  marketStatus: string | null;
  reasonCode: string | null;
  openState: boolean | null;
}

export async function fetchDynamic(contractAddress: string): Promise<DynamicSnap | null> {
  const url =
    "https://www.binance.com/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai?chainId=56&contractAddress=" +
    contractAddress;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    data?: {
      tokenInfo?: { price?: string; sharesMultiplier?: string };
      stockInfo?: {
        price?: string | null;
        previousClose?: string | null;
        prevClose?: string | null;
        preClose?: string | null;
        open?: string | null;
        openPrice?: string | null;
      };
      statusInfo?: { marketStatus?: string | null; reasonCode?: string | null; openState?: boolean | null };
    };
  };
  const data = body.data;
  if (!data) return null;
  const price = Number(data.tokenInfo?.price);
  const multiplier = Number(data.tokenInfo?.sharesMultiplier);
  const stock = Number(data.stockInfo?.price);
  const previousClose = firstPositive(
    data.stockInfo?.previousClose,
    data.stockInfo?.prevClose,
    data.stockInfo?.preClose,
  );
  const open = firstPositive(data.stockInfo?.open, data.stockInfo?.openPrice);
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
    stockPrice: Number.isFinite(stock) && stock > 0 ? stock : null,
    previousClose,
    open,
    marketStatus: data.statusInfo?.marketStatus ?? null,
    reasonCode: data.statusInfo?.reasonCode ?? null,
    openState: data.statusInfo?.openState ?? null,
  };
}

function firstPositive(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export interface RwaTokenPrice {
  tokenContractAddress: string;
  platformId: string | null;
  /** On-chain token price in USD. */
  tokenPrice: number | null;
  /**
   * Per-share converted price from the on-chain token, not an official cash print.
   * Use as a live TradFi-shaped reference when the cash chart is missing.
   */
  referencePrice: number | null;
}

export function parseRwaPriceRows(data: unknown): RwaTokenPrice[] {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const out: RwaTokenPrice[] = [];
  for (const row of rows) {
    const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const tokenPrice = firstPositive(rec.tokenPrice);
    const referencePrice = firstPositive(rec.referencePrice);
    const tokenContractAddress = String(rec.tokenContractAddress || "");
    if (!tokenContractAddress) continue;
    out.push({
      tokenContractAddress,
      platformId: rec.platformId ? String(rec.platformId) : null,
      tokenPrice,
      referencePrice,
    });
  }
  return out;
}

/** GET /api/v1/dex/market/rwa/price — signed Market API. */
export async function fetchRwaPrices(addresses: string[]): Promise<RwaTokenPrice[]> {
  const unique = [...new Set(addresses.map((addr) => getAddress(addr)))];
  if (!unique.length) return [];
  const res = await web3Fetch("GET", "/api/v1/dex/market/rwa/price", {
    query: {
      binanceChainId: "56",
      tokenContractAddresses: unique.join(","),
    },
  });
  return parseRwaPriceRows(res.data);
}

export interface RwaUnderlyingMarket {
  previousClose: number | null;
  open: number | null;
  last: number | null;
  referencePrice: number | null;
  raw: Record<string, unknown>;
}

export function parseRwaUnderlyingMarket(data: unknown): RwaUnderlyingMarket {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const market =
    root.marketData && typeof root.marketData === "object"
      ? (root.marketData as Record<string, unknown>)
      : root;
  const previousClose = firstPositive(
    market.previousClose,
    market.prevClose,
    market.preClose,
    market.prevClosePrice,
    market.previousClosePrice,
    market.priorClose,
    root.previousClose,
  );
  const open = firstPositive(market.open, market.openPrice, market.preMarketOpen, root.open);
  const last = firstPositive(
    market.last,
    market.lastPrice,
    market.price,
    market.close,
    root.lastPrice,
  );
  const referencePrice = firstPositive(market.referencePrice, root.referencePrice, last);
  return { previousClose, open, last, referencePrice, raw: root };
}

/** GET /api/v1/dex/market/rwa/underlying-market — signed Market API. */
export async function fetchRwaUnderlyingMarket(contractAddress: string): Promise<RwaUnderlyingMarket | null> {
  const res = await web3Fetch("GET", "/api/v1/dex/market/rwa/underlying-market", {
    query: {
      binanceChainId: "56",
      tokenContractAddress: getAddress(contractAddress),
    },
  });
  return parseRwaUnderlyingMarket(res.data);
}

export interface Candle {
  t: number;
  c: number;
  v?: number;
}

export async function fetchKline(contractAddress: string): Promise<Candle[]> {
  const url =
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai?chainId=56&contractAddress=" +
    `${contractAddress}&interval=15m&limit=96`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`kline HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { klineInfos?: unknown[] }; message?: string };
  const rows = body.data?.klineInfos;
  if (!rows) throw new Error(body.message || "kline returned no rows");
  return rows
    .map((row) => {
      const cell = row as [number, string, string, string, string, string?];
      const volume = Number(cell[5]);
      return { t: Number(cell[0]), c: Number(cell[4]), v: Number.isFinite(volume) ? volume : 0 };
    })
    .filter((c) => Number.isFinite(c.c) && c.c > 0);
}

export interface TradFiSnap {
  referencePrice: number | null;
  fridayClose: number | null;
  fridayDate: string | null;
  priorClose: number | null;
  priorDate: string | null;
  isMarketOpen: boolean;
  source: string;
  onchainPrice: number | null;
}

function canSignWeb3(): boolean {
  const env = readEnv();
  return Boolean(env.web3ApiKey && env.web3ApiSecret);
}

export async function rwaPrintsForWrapper(ticker: string, contractAddress: string): Promise<{
  prints: CashPrints;
  referencePrice: number | null;
  onchainPrice: number | null;
  source: string;
} | null> {
  const empty = {
    ticker: ticker.toUpperCase(),
    source: RWA_MARKET_SOURCE,
    friday: null,
    prior: null,
    today: null,
  } satisfies CashPrints;
  if (canSignWeb3()) {
    try {
      const [market, prices] = await Promise.all([
        fetchRwaUnderlyingMarket(contractAddress),
        fetchRwaPrices([contractAddress]).catch(() => [] as RwaTokenPrice[]),
      ]);
      const price = prices.find(
        (row) => row.tokenContractAddress.toLowerCase() === contractAddress.toLowerCase(),
      );
      const prints = cashPrintsFromRwaMarket(ticker, {
        previousClose: market?.previousClose ?? null,
        open: market?.open ?? null,
        last: market?.last ?? null,
        referencePrice: market?.referencePrice ?? price?.referencePrice ?? null,
      });
      const hasPrint = Boolean(prints.prior || prints.friday);
      return {
        prints: hasPrint ? prints : empty,
        referencePrice: market?.referencePrice ?? price?.referencePrice ?? prints.prior?.close ?? null,
        onchainPrice: price?.tokenPrice ?? null,
        source: hasPrint ? prints.source : price ? RWA_PRICE_SOURCE : "unavailable",
      };
    } catch {
      // Fall through to the public dynamic snapshot.
    }
  }
  const dynamic = await fetchDynamic(contractAddress).catch(() => null);
  if (!dynamic) return null;
  const prints = cashPrintsFromRwaMarket(
    ticker,
    {
      previousClose: dynamic.previousClose,
      open: dynamic.open,
      last: dynamic.stockPrice,
      referencePrice: dynamic.stockPrice,
    },
    new Date(),
    "binance-rwa-dynamic",
  );
  return {
    prints,
    referencePrice: dynamic.stockPrice,
    onchainPrice: dynamic.price,
    source: prints.prior || prints.friday ? prints.source : dynamic.stockPrice ? "binance-rwa-dynamic" : "unavailable",
  };
}

/**
 * Signed RWA Data API first (on-chain token vs underlying reference), then Yahoo/Stooq
 * so Friday 16:00 ET still exists when the RWA payload only has the prior session.
 */
export async function hydrateCashPrints(ticker: string, wrappers?: Array<Pick<Wrapper, "address"> & { rail?: Wrapper["rail"] }>): Promise<{
  prints: CashPrints;
  referencePrice: number | null;
  onchainPrice: number | null;
  source: string;
}> {
  const symbol = ticker.trim().toUpperCase();
  const preferred = wrappers?.find((item) => item.rail === "bStock") || wrappers?.[0];
  const rwa = preferred ? await rwaPrintsForWrapper(symbol, preferred.address).catch(() => null) : null;
  const chart = await fetchCashPrints(symbol).catch(() => null);
  const prints = rwa?.prints && chart ? mergePrints(rwa.prints, chart) : rwa?.prints && (rwa.prints.prior || rwa.prints.friday) ? rwa.prints : chart ?? {
    ticker: symbol,
    source: "unavailable",
    friday: null,
    prior: null,
    today: null,
  };
  return {
    prints,
    referencePrice: rwa?.referencePrice ?? prints.prior?.close ?? prints.friday?.close ?? null,
    onchainPrice: rwa?.onchainPrice ?? null,
    source: prints.friday ? prints.source : rwa?.source || prints.source,
  };
}

/** Friday cash close from RWA Data API, with the daily chart as fallback. */
export async function fetchTradFiReference(ticker: string, contractAddress?: string): Promise<TradFiSnap> {
  const wrappers = contractAddress
    ? [{ rail: "bStock" as const, address: contractAddress as Wrapper["address"] }]
    : undefined;
  const hydrated = await hydrateCashPrints(ticker, wrappers);
  const prints = hydrated.prints;
  const fridayClose = prints.friday?.close ?? null;
  const priorClose = prints.prior?.close ?? null;
  const referencePrice = priorClose ?? fridayClose ?? hydrated.referencePrice;
  const cashOpen = cashSession().atmosphere === "open";
  const dynamic = contractAddress ? await fetchDynamic(contractAddress).catch(() => null) : null;
  const chainOpen = dynamic?.openState;
  const isMarketOpen = chainOpen === false ? false : chainOpen === true ? true : cashOpen;
  let source = "unavailable";
  if (priorClose || fridayClose) source = prints.source;
  else if (hydrated.referencePrice) source = hydrated.source;
  return {
    referencePrice,
    fridayClose,
    fridayDate: prints.friday?.sessionDate ?? null,
    priorClose,
    priorDate: prints.prior?.sessionDate ?? null,
    isMarketOpen,
    source,
    onchainPrice: hydrated.onchainPrice,
  };
}
