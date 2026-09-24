import { cashSession, fetchCashPrints, RWA_LIST_URL, type LiveListRow } from "@parallax/core";

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
      stockInfo?: { price?: string | null };
      statusInfo?: { marketStatus?: string | null; reasonCode?: string | null; openState?: boolean | null };
    };
  };
  const data = body.data;
  if (!data) return null;
  const price = Number(data.tokenInfo?.price);
  const multiplier = Number(data.tokenInfo?.sharesMultiplier);
  const stock = Number(data.stockInfo?.price);
  return {
    price: Number.isFinite(price) && price > 0 ? price : null,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
    stockPrice: Number.isFinite(stock) && stock > 0 ? stock : null,
    marketStatus: data.statusInfo?.marketStatus ?? null,
    reasonCode: data.statusInfo?.reasonCode ?? null,
    openState: data.statusInfo?.openState ?? null,
  };
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
}

/** Friday cash close from the daily chart, with the RWA dynamic flag for whether cash is open. */
export async function fetchTradFiReference(ticker: string, contractAddress?: string): Promise<TradFiSnap> {
  const prints = await fetchCashPrints(ticker).catch(() => null);
  const dynamic = contractAddress ? await fetchDynamic(contractAddress).catch(() => null) : null;
  const fridayClose = prints?.friday?.close ?? null;
  const priorClose = prints?.prior?.close ?? null;
  const stock = dynamic?.stockPrice ?? null;
  const referencePrice = priorClose ?? fridayClose ?? stock;
  const cashOpen = cashSession().atmosphere === "open";
  const chainOpen = dynamic?.openState;
  const isMarketOpen = chainOpen === false ? false : chainOpen === true ? true : cashOpen;
  let source = "unavailable";
  if (priorClose || fridayClose) source = prints?.source || "yahoo-chart-1d";
  else if (stock) source = "binance-rwa-dynamic";
  return {
    referencePrice,
    fridayClose,
    fridayDate: prints?.friday?.sessionDate ?? null,
    priorClose,
    priorDate: prints?.prior?.sessionDate ?? null,
    isMarketOpen,
    source,
  };
}
