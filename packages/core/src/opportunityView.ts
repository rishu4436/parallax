import { quoteFreshness } from "./amounts";
import { evaluateLimits, limitsFromSettings, type RiskLimits } from "./flag";
import type { MarketCatalogAsset } from "./markets";
import { bestExecutable, type OpportunityCard } from "./opportunity";
import type { PolicyProposal } from "./policy";
import type { Address, Rail, Settings } from "./types";
import { QUOTE_TTL_MS } from "./types";

export type OpportunityLens = "all" | "open" | "cash-closed" | "cross-rail" | "attention";
export type OpportunitySort = "net" | "gap" | "alpha";
export type ScanPhase = "SCANNING" | "LIVE" | "STALE" | "PARTIAL" | "OFFLINE";
export type AgenticAvailability = "CONNECTED" | "DISCONNECTED" | "UNKNOWN";
export type StudioDeskStatus = "ONLINE" | "OFFLINE" | "NOT CONNECTED TO DESK";

export interface OpportunityQuery {
  lens?: OpportunityLens;
  search?: string;
  rail?: "all" | Rail;
  sort?: OpportunitySort;
  cashOpen?: boolean;
  now?: number;
  limits?: RiskLimits;
  sizeUsdt?: number;
}

export interface OpportunityQueueRow {
  ticker: string;
  name: string;
  card: OpportunityCard;
  rails: OpportunityCard[];
}

export function universeCounts(catalog: MarketCatalogAsset[]): { assets: number; rails: number } {
  return {
    assets: catalog.length,
    rails: catalog.reduce((count, asset) => count + asset.wrappers.length, 0),
  };
}

export function scanPhase(input: { scanning: boolean; error?: string | null; cards: number; scanAt: number; now: number }): ScanPhase {
  if (input.scanning && input.cards === 0) return "SCANNING";
  if (input.error && input.cards === 0) return "OFFLINE";
  if (input.error && input.cards > 0) return "PARTIAL";
  if (input.cards === 0) return "OFFLINE";
  if (input.scanAt > 0 && input.now - input.scanAt > QUOTE_TTL_MS) return "STALE";
  return "LIVE";
}

export function cardIsStale(card: OpportunityCard, now = Date.now()): boolean {
  if (card.quoteExpiresAt == null) return false;
  return quoteFreshness(card.quoteExpiresAt, now).stale;
}

export function cardForRail(cards: OpportunityCard[], ticker: string, rail: Rail): OpportunityCard | null {
  return cards.find((card) => card.ticker.toUpperCase() === ticker.toUpperCase() && card.rail === rail) ?? null;
}

function byNet(a: OpportunityCard, b: OpportunityCard): number {
  const net = Math.abs(b.netPct) - Math.abs(a.netPct);
  if (Math.abs(net) > 1e-9) return net;
  const gap = Math.abs(b.grossPct) - Math.abs(a.grossPct);
  if (Math.abs(gap) > 1e-9) return gap;
  return a.ticker.localeCompare(b.ticker) || a.symbol.localeCompare(b.symbol);
}

function representative(rows: OpportunityCard[]): OpportunityCard {
  return bestExecutable(rows) ?? [...rows].sort(byNet)[0];
}

export function opportunityQueue(cards: OpportunityCard[]): OpportunityQueueRow[] {
  const groups = new Map<string, OpportunityCard[]>();
  for (const card of cards) {
    const key = card.ticker.toUpperCase();
    const list = groups.get(key) || [];
    list.push(card);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([ticker, rails]) => {
      const card = representative(rails);
      return { ticker, name: card.name, card, rails };
    })
    .sort((a, b) => byNet(a.card, b.card));
}

function matchesSearch(row: OpportunityQueueRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  if (row.ticker.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)) return true;
  return row.rails.some((card) => card.symbol.toLowerCase().includes(needle));
}

function focused(row: OpportunityQueueRow, rail: "all" | Rail | undefined): OpportunityQueueRow | null {
  if (!rail || rail === "all") return row;
  const card = row.rails.find((item) => item.rail === rail);
  if (!card) return null;
  return { ...row, card };
}

export function needsAttention(card: OpportunityCard, limits: RiskLimits, sizeUsdt: number, now = Date.now()): boolean {
  if (cardIsStale(card, now)) return true;
  if (card.status !== "OPEN") return true;
  if (!(card.reference > 0) || !(card.perShare > 0)) return true;
  if (!card.complete) return true;
  return !evaluateLimits(card, limits, sizeUsdt).pass;
}

export function isCrossRail(row: OpportunityQueueRow): boolean {
  return row.rails.filter((card) => card.perShare > 0).length >= 2;
}

export function queryOpportunityQueue(rows: OpportunityQueueRow[], query: OpportunityQuery = {}): OpportunityQueueRow[] {
  const now = query.now ?? Date.now();
  const limits = query.limits ?? limitsFromSettings(undefined, query.sizeUsdt ?? 10);
  const size = query.sizeUsdt ?? 10;
  const lens = query.lens ?? "all";
  const next = rows
    .filter((row) => matchesSearch(row, query.search || ""))
    .map((row) => focused(row, query.rail))
    .filter((row): row is OpportunityQueueRow => Boolean(row))
    .filter((row) => {
      if (lens === "open") return row.card.status === "OPEN" && !cardIsStale(row.card, now);
      if (lens === "cash-closed") return query.cashOpen === false && row.card.status === "OPEN";
      if (lens === "cross-rail") return isCrossRail(row);
      if (lens === "attention") return needsAttention(row.card, limits, size, now);
      return true;
    });
  const sort = query.sort ?? "net";
  next.sort((a, b) => {
    if (sort === "alpha") return a.ticker.localeCompare(b.ticker);
    if (sort === "gap") {
      const gap = Math.abs(b.card.grossPct) - Math.abs(a.card.grossPct);
      if (Math.abs(gap) > 1e-9) return gap;
      return a.ticker.localeCompare(b.ticker);
    }
    return byNet(a.card, b.card);
  });
  return next;
}

export function proposalFromOpportunity(input: {
  card: OpportunityCard;
  settings: Settings;
  spentToday: number;
  now: number;
  wallet: Address;
  usdt: string;
  quote?: PolicyProposal["quote"];
}): PolicyProposal {
  return {
    source: "ui",
    mode: "preview",
    intent: {
      ticker: input.card.ticker,
      side: "buy",
      usdt: input.usdt,
      wallet: input.wallet,
      railLock: input.card.rail,
      actor: "user",
    },
    settings: input.settings,
    spentToday: input.spentToday,
    now: input.now,
    quote: input.quote ?? null,
    signer: input.wallet,
    reference: {
      price: input.card.reference > 0 ? input.card.reference : null,
      label: input.card.referenceLabel,
    },
    liquidity: input.card.liquidity > 0 ? input.card.liquidity : undefined,
    executionRequirement: input.card.mode === "RFQ" ? "RFQ" : "EVM_SIMULATION",
  };
}

export function agenticAvailability(status?: string | null): AgenticAvailability {
  if (status == null || status === "") return "UNKNOWN";
  if (status === "CONNECTED") return "CONNECTED";
  return "DISCONNECTED";
}

export function studioDeskStatus(input: { deskKnown: boolean; live: boolean }): StudioDeskStatus {
  if (!input.deskKnown) return "NOT CONNECTED TO DESK";
  return input.live ? "ONLINE" : "OFFLINE";
}
