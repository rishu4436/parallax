import { RWA_LIST_URL, type LiveListRow } from "@parallax/core";

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
    price: Number.isFinite(price) ? price : null,
    multiplier: Number.isFinite(multiplier) && multiplier > 0 ? multiplier : null,
    stockPrice: Number.isFinite(stock) ? stock : null,
    marketStatus: data.statusInfo?.marketStatus ?? null,
    reasonCode: data.statusInfo?.reasonCode ?? null,
    openState: data.statusInfo?.openState ?? null,
  };
}

export interface Candle {
  t: number;
  c: number;
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
      const cell = row as [number, string, string, string, string];
      return { t: Number(cell[0]), c: Number(cell[4]) };
    })
    .filter((c) => Number.isFinite(c.c) && c.c > 0);
}
