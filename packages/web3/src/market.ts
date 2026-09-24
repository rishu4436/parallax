import { fetchDynamic, fetchKline } from "./rwa";

export interface MarketPrint {
  tokenPrice: number | null;
  /** Token price divided by the share multiplier. This is the live BSC print. */
  perShare: number | null;
  stockPrice: number | null;
  /** True when the RWA status is open, and when the status is missing. A missing flag must not look like a weekend close. */
  isMarketOpen: boolean;
  volume: number;
  multiplier: number | null;
}

const cache = new Map<string, { at: number; snap: MarketPrint }>();
const TTL_MS = 15_000;

export async function fetchMarketPrint(contractAddress: string): Promise<MarketPrint> {
  const key = contractAddress.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.snap;
  const dynamic = await fetchDynamic(contractAddress).catch(() => null);
  let volume = 0;
  try {
    const candles = await fetchKline(contractAddress);
    volume = candles.reduce((sum, candle) => sum + (candle.v || 0), 0);
  } catch {
    volume = 0;
  }
  const multiplier = dynamic?.multiplier && dynamic.multiplier > 0 ? dynamic.multiplier : null;
  const tokenPrice = dynamic?.price ?? null;
  const perShare = tokenPrice != null ? (multiplier ? tokenPrice / multiplier : tokenPrice) : null;
  const snap: MarketPrint = {
    tokenPrice,
    perShare: perShare != null && perShare > 0 ? perShare : null,
    stockPrice: dynamic?.stockPrice ?? null,
    isMarketOpen: dynamic?.openState !== false,
    volume,
    multiplier,
  };
  cache.set(key, { at: Date.now(), snap });
  return snap;
}

export interface BnbMarket {
  currentPrice: number;
  volume: number;
  changePct: number;
}

export async function fetchBnbMarket(): Promise<BnbMarket | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BNBUSDT", {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { lastPrice?: string; volume?: string; priceChangePercent?: string };
    const currentPrice = Number(body.lastPrice);
    const volume = Number(body.volume);
    const changePct = Number(body.priceChangePercent);
    if (!Number.isFinite(currentPrice) || !(currentPrice > 0)) return null;
    return {
      currentPrice,
      volume: Number.isFinite(volume) ? volume : 0,
      changePct: Number.isFinite(changePct) ? changePct : 0,
    };
  } catch {
    return null;
  }
}
