export interface Basket {
  id: string;
  name: string;
  blurb: string;
  tickers: string[];
}

export const BASKETS: Basket[] = [
  {
    id: "ai",
    name: "AI chips",
    blurb: "NVIDIA and AMD. The two chip names in this book.",
    tickers: ["NVDA", "AMD"],
  },
  {
    id: "mega",
    name: "Mega caps",
    blurb: "Apple, Microsoft, Alphabet, Amazon, and Meta. Equal slices.",
    tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META"],
  },
  {
    id: "index",
    name: "Index",
    blurb: "QQQ and SPY. Broad exposure, fewer earnings gaps.",
    tickers: ["QQQ", "SPY"],
  },
  {
    id: "consumer",
    name: "Consumer",
    blurb: "Amazon and Tesla. Retail demand and cars.",
    tickers: ["AMZN", "TSLA"],
  },
];

export function basketById(id: string): Basket | undefined {
  return BASKETS.find((basket) => basket.id === id);
}

export function matchBasket(text: string): Basket | undefined {
  const q = text.toLowerCase();
  if (/\bai\b|chip/.test(q)) return basketById("ai");
  if (/mega/.test(q)) return basketById("mega");
  if (/\bindex\b|qqq and spy|spy and qqq/.test(q)) return basketById("index");
  if (/consumer/.test(q)) return basketById("consumer");
  return undefined;
}

/** Equal slices of a USDT total. The last name absorbs the rounding remainder. */
export function splitBasket(totalUsdt: string, tickers: string[]): { ticker: string; usdt: string }[] {
  const names = tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean);
  const total = Number(totalUsdt);
  if (!names.length || !Number.isFinite(total) || total <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / names.length);
  let used = 0;
  return names.map((ticker, index) => {
    const share = index === names.length - 1 ? cents - used : base;
    used += share;
    return { ticker, usdt: (share / 100).toFixed(2) };
  });
}
