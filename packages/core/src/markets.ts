import { formatAge, quoteFreshness } from "./amounts";
import { bestExecutable, type OpportunityCard } from "./opportunity";
import { listUnderlyings, wrapperList } from "./registry";
import { gapPct } from "./router";
import type { Rail, RailBook, RailStatus } from "./types";
import { QUOTE_TTL_MS } from "./types";

export const MARKET_RAILS: Rail[] = ["bStock", "ondo", "xStock"];

export type MarketStatus = RailStatus | "UNKNOWN";
export type MarketStatusFilter = "all" | RailStatus;
export type MarketRailFilter = "all" | Rail;
export type MarketRelevance = "all" | "executable" | "none";
export type MarketSort = "alpha" | "gap" | "price" | "availability";

export interface MarketCatalogWrapper {
  rail: Rail;
  symbol: string;
  multiplier: number;
}

/** Normalized asset. The page does not read the seeded registry or a future live catalog directly. */
export interface MarketCatalogAsset {
  ticker: string;
  name: string;
  wrappers: MarketCatalogWrapper[];
}

export interface RailQuoteView {
  rail: Rail;
  symbol: string;
  status: MarketStatus;
  mode: string | null;
  perShare: number | null;
  reference: number | null;
  gapPct: number | null;
  priceImpactPct: number | null;
  networkFeeUsd: number | null;
  gasEstimateUsd: number | null;
  estimatedGasUnits: string | null;
  tradeFeeUsd: number | null;
  quoteExpiresAt: number | null;
  multiplier: number;
  liquidity: number | null;
  errorText?: string;
  vendor?: string;
}

export interface MarketAssetView {
  ticker: string;
  name: string;
  rails: RailQuoteView[];
  best: RailQuoteView | null;
  reference: number | null;
  referenceLabel: string;
  gapPct: number | null;
  liquidity: number | null;
  status: MarketStatus;
  quoteExpiresAt: number | null;
}

export interface MarketQuery {
  search?: string;
  status?: MarketStatusFilter;
  rail?: MarketRailFilter;
  relevance?: MarketRelevance;
  sort?: MarketSort;
  now?: number;
}

export interface MarketReferencePrint {
  id: string;
  label: string;
  value: number | null;
  date: string | null;
  source: string;
}

export interface AssetReferenceView {
  prints: MarketReferencePrint[];
  gaps: Array<{ label: string; pct: number | null }>;
  available: boolean;
}

export function marketCatalog(): MarketCatalogAsset[] {
  return listUnderlyings().map((underlying) => ({
    ticker: underlying.ticker,
    name: underlying.name,
    wrappers: wrapperList(underlying).map((wrapper) => ({
      rail: wrapper.rail,
      symbol: wrapper.symbol,
      multiplier: wrapper.multiplier,
    })),
  }));
}

export function catalogAsset(ticker: string): MarketCatalogAsset | null {
  const key = ticker.trim().toUpperCase();
  return marketCatalog().find((asset) => asset.ticker === key) ?? null;
}

export function marketLayout(width: number): "table" | "stack" {
  return width >= 900 ? "table" : "stack";
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function railFromCard(wrapper: MarketCatalogWrapper, card?: OpportunityCard): RailQuoteView {
  const perShare = card?.status ? positive(card.perShare) : null;
  const reference = positive(card?.reference);
  return {
    rail: wrapper.rail,
    symbol: card?.symbol || wrapper.symbol,
    status: card?.status ?? "UNKNOWN",
    mode: card?.mode || null,
    perShare,
    reference,
    gapPct: perShare != null ? gapPct(perShare, reference) : null,
    priceImpactPct: card?.priceImpactPct ?? null,
    networkFeeUsd: card?.networkFeeUsd ?? null,
    gasEstimateUsd: card?.gasEstimateUsd ?? null,
    estimatedGasUnits: card?.estimatedGasUnits || null,
    tradeFeeUsd: card?.tradeFeeUsd ?? null,
    quoteExpiresAt: card?.quoteExpiresAt ?? null,
    multiplier: card?.multiplier && card.multiplier > 0 ? card.multiplier : wrapper.multiplier,
    liquidity: card?.liquidity ?? null,
    errorText: card?.errorText,
    vendor: card?.vendor,
  };
}

function aggregateStatus(rails: RailQuoteView[]): MarketStatus {
  if (rails.some((rail) => rail.status === "HALTED")) return "HALTED";
  if (rails.some((rail) => rail.status === "OFFLINE")) return "OFFLINE";
  if (rails.some((rail) => rail.status === "CLOSED")) return "CLOSED";
  if (rails.some((rail) => rail.status === "OPEN")) return "OPEN";
  return "UNKNOWN";
}

export function marketViews(catalog: MarketCatalogAsset[], cards: OpportunityCard[]): MarketAssetView[] {
  return catalog.map((asset) => {
    const mine = cards.filter((card) => card.ticker.toUpperCase() === asset.ticker);
    const rails = asset.wrappers.map((wrapper) => railFromCard(wrapper, mine.find((card) => card.rail === wrapper.rail)));
    const bestCard = bestExecutable(mine);
    const best = bestCard ? rails.find((rail) => rail.rail === bestCard.rail) || null : null;
    const referenceCard = mine.find((card) => positive(card.reference) != null);
    const reference = best?.reference ?? positive(referenceCard?.reference);
    return {
      ticker: asset.ticker,
      name: asset.name,
      rails,
      best,
      reference,
      referenceLabel: (reference ? referenceCard?.referenceLabel || bestCard?.referenceLabel : "") || "Reference",
      gapPct: best?.gapPct ?? null,
      liquidity: best?.liquidity ?? null,
      status: best?.status ?? aggregateStatus(rails),
      quoteExpiresAt: best?.quoteExpiresAt ?? null,
    };
  });
}

export function railsFromBooks(books: RailBook[], reference: number | null): RailQuoteView[] {
  return MARKET_RAILS.map((rail) => {
    const book = books.find((row) => row.wrapper.rail === rail);
    if (!book) {
      return {
        rail,
        symbol: "—",
        status: "UNKNOWN",
        mode: null,
        perShare: null,
        reference: positive(reference),
        gapPct: null,
        priceImpactPct: null,
        networkFeeUsd: null,
        gasEstimateUsd: null,
        estimatedGasUnits: null,
        tradeFeeUsd: null,
        quoteExpiresAt: null,
        multiplier: 1,
        liquidity: null,
      };
    }
    const quote = book.best;
    const perShare = quote?.ok ? positive(quote.perShare) : null;
    const ref = positive(reference);
    return {
      rail,
      symbol: book.wrapper.symbol,
      status: book.status,
      mode: quote?.executionMode || null,
      perShare,
      reference: ref,
      gapPct: perShare != null ? gapPct(perShare, ref) : null,
      priceImpactPct: quote?.priceImpactPct ?? null,
      networkFeeUsd: quote?.networkFeeUsd ?? null,
      gasEstimateUsd: quote?.gasEstimateUsd ?? null,
      estimatedGasUnits: quote?.estimatedGasUnits || null,
      tradeFeeUsd: quote?.tradeFeeUsd ?? null,
      quoteExpiresAt: quote?.ok ? quote.quoteExpiresAt ?? null : null,
      multiplier: book.wrapper.multiplier,
      liquidity: null,
      errorText: book.errorText || quote?.errorText,
      vendor: quote?.vendorName,
    };
  });
}

function focusRail(view: MarketAssetView, rail: MarketRailFilter | undefined): MarketAssetView {
  if (!rail || rail === "all") return view;
  const selected = view.rails.find((row) => row.rail === rail);
  if (!selected) return view;
  return {
    ...view,
    best: selected.status === "UNKNOWN" && selected.perShare == null ? null : selected,
    reference: selected.reference ?? view.reference,
    gapPct: selected.gapPct,
    liquidity: selected.liquidity,
    status: selected.status,
    quoteExpiresAt: selected.quoteExpiresAt,
  };
}

function searchable(view: MarketAssetView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (view.ticker.toLowerCase().includes(needle)) return true;
  if (view.name.toLowerCase().includes(needle)) return true;
  return view.rails.some((rail) => rail.symbol.toLowerCase().includes(needle));
}

function stale(view: MarketAssetView, now: number): boolean {
  if (view.quoteExpiresAt == null) return false;
  return quoteFreshness(view.quoteExpiresAt, now).stale;
}

const STATUS_RANK: Record<MarketStatus, number> = {
  OPEN: 0,
  CLOSED: 1,
  HALTED: 2,
  OFFLINE: 3,
  UNKNOWN: 4,
};

export function queryMarkets(views: MarketAssetView[], query: MarketQuery = {}): MarketAssetView[] {
  const now = query.now ?? Date.now();
  const rail = query.rail ?? "all";
  const status = query.status ?? "all";
  const relevance = query.relevance ?? "all";
  const sort = query.sort ?? "alpha";
  const rows = views
    .filter((view) => (rail === "all" ? true : view.rails.some((item) => item.rail === rail)))
    .filter((view) => searchable(view, query.search || ""))
    .map((view) => focusRail(view, rail))
    .filter((view) => (status === "all" ? true : view.status === status))
    .filter((view) => {
      if (relevance === "executable") return view.status === "OPEN" && view.best?.perShare != null && !stale(view, now);
      if (relevance === "none") return view.status !== "OPEN";
      return true;
    });
  rows.sort((a, b) => {
    if (sort === "alpha") return a.ticker.localeCompare(b.ticker);
    if (sort === "price") {
      const av = a.best?.perShare ?? -1;
      const bv = b.best?.perShare ?? -1;
      if (av !== bv) return bv - av;
      return a.ticker.localeCompare(b.ticker);
    }
    if (sort === "gap") {
      const av = a.gapPct == null ? -1 : Math.abs(a.gapPct);
      const bv = b.gapPct == null ? -1 : Math.abs(b.gapPct);
      if (av !== bv) return bv - av;
      return a.ticker.localeCompare(b.ticker);
    }
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return a.ticker.localeCompare(b.ticker);
  });
  return rows;
}

export function featuredMarkets(views: MarketAssetView[], limit = 3): MarketAssetView[] {
  return views
    .filter((view) => view.best?.status === "OPEN" && view.best.perShare != null)
    .sort((a, b) => {
      const av = a.gapPct == null ? -1 : Math.abs(a.gapPct);
      const bv = b.gapPct == null ? -1 : Math.abs(b.gapPct);
      if (av !== bv) return bv - av;
      return a.ticker.localeCompare(b.ticker);
    })
    .slice(0, limit);
}

export function assetReference(input: {
  perShare: number | null;
  priorClose?: number | null;
  priorDate?: string | null;
  priorOpen?: number | null;
  fridayClose?: number | null;
  fridayDate?: string | null;
  fridayOpen?: number | null;
  sessionOpen?: number | null;
  sessionOpenDate?: string | null;
  rwaReference?: number | null;
}): AssetReferenceView {
  const prints: MarketReferencePrint[] = [
    { id: "prior-close", label: "Prior cash close", value: positive(input.priorClose), date: input.priorDate || null, source: "cash session" },
    { id: "friday-close", label: "Friday close", value: positive(input.fridayClose), date: input.fridayDate || null, source: "cash session" },
    { id: "prior-open", label: "Prior open", value: positive(input.priorOpen), date: input.priorDate || null, source: "cash session" },
    { id: "session-open", label: "Session open", value: positive(input.sessionOpen), date: input.sessionOpenDate || null, source: "cash session" },
    { id: "rwa", label: "RWA reference", value: positive(input.rwaReference), date: null, source: "RWA reference" },
  ];
  const gaps = prints.map((print) => ({
    label: `vs ${print.label}`,
    pct: print.value != null && input.perShare != null ? gapPct(input.perShare, print.value) : null,
  }));
  return { prints, gaps, available: prints.some((print) => print.value != null) };
}

export function activityForTicker<T extends { ticker: string }>(rows: T[], ticker: string): T[] {
  const key = ticker.trim().toUpperCase();
  return rows.filter((row) => row.ticker.toUpperCase() === key);
}

export function quoteAgeLabel(quoteExpiresAt: number | null, now = Date.now()): { label: string; stale: boolean } {
  if (quoteExpiresAt == null) return { label: "—", stale: false };
  const fresh = quoteFreshness(quoteExpiresAt, now);
  if (fresh.stale) return { label: "QUOTE STALE", stale: true };
  const ageMs = Math.max(0, QUOTE_TTL_MS - fresh.leftoverMs);
  return { label: formatAge(ageMs), stale: false };
}
