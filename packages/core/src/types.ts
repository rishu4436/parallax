export type Rail = "bStock" | "ondo" | "xStock";
export type ExecMode = "SWAP" | "RFQ";
export type Session = "pre" | "regular" | "post" | "overnight" | "weekend" | "holiday";
export type Atmosphere = "open" | "closed";
export type Side = "buy" | "sell";
export type Address = `0x${string}`;

export type RouterState =
  | "idle"
  | "resolving"
  | "quoting"
  | "selecting"
  | "building"
  | "simulating"
  | "awaiting_signature"
  | "submitting"
  | "polling"
  | "filled"
  | "failed"
  | "expired"
  | "rail_closed";

export interface Wrapper {
  rail: Rail;
  type: 1 | 2 | 3;
  symbol: string;
  address: Address;
  decimals: number;
  multiplier: number;
}

export interface Underlying {
  ticker: string;
  name: string;
  wrappers: Partial<Record<Rail, Wrapper>>;
}

export interface VenueQuote {
  wrapper: Wrapper;
  ok: boolean;
  errorCode?: number;
  errorText?: string;
  executionMode?: ExecMode;
  vendorName?: string;
  quoteId?: string;
  quoteExpiresAt: number;
  inAmount: string;
  outAmount: string;
  mid: number;
  /** Per-share equivalent: mid / multiplier. Used for the cash gap. */
  perShare: number;
  slipBps50: number;
  slipBps500: number;
  slipKnown: boolean;
  gasUsd: number;
  approveTarget?: string;
  raw: unknown;
}

export interface Intent {
  ticker: string;
  side: Side;
  usdt: string;
  railLock?: Rail;
  vendorLock?: string;
  wallet: Address;
  stable?: "USDT" | "USDC" | "USD1";
  /** Agent jobs are capped. A manual Buy or Sell is not. */
  actor?: "user" | "agent";
}

export type ModeBadge = "RFQ" | "SWAP" | "AMM" | "RFQ+SWAP";
export type RailStatus = "OPEN" | "CLOSED" | "HALTED" | "OFFLINE";

export interface RailBook {
  wrapper: Wrapper;
  routes: VenueQuote[];
  best?: VenueQuote;
  badge: ModeBadge | "—";
  status: RailStatus;
  errorText?: string;
  errorCode?: number;
}

export interface Settings {
  orderCapUsdt: number;
  dailyCapUsdt: number;
  allowedRails: Rail[];
  killSwitch: boolean;
}

export type JobType = "dca" | "flatten_earnings" | "weekend_cap" | "cheap_rail" | "gap_fade" | "open_print";

export type QueueMode = "trade_if_open" | "queue_for_cash_open";

export interface DcaSpec {
  tickers: string[];
  usdtEach: string;
  cron: string;
  rail: "best" | Rail;
  /** Skip the buy when the best open rail is richer than Friday by this percent. */
  maxPremiumPct?: number;
}

export interface FlattenSpec {
  ticker: string;
  cutPctBeforePrint: number;
  dipPct: number;
  usdtAdd: string;
  flattenAfterHours: boolean;
  printAt?: string;
}

export interface WeekendCapSpec {
  maxUsdt: string;
  gapPct: number;
  mode: QueueMode;
  ticker: string;
}

export interface CheapRailSpec {
  tickers: string[];
  usdtEach: string;
  /** Minimum per-share spread between the richest and cheapest open rail, in basis points. */
  minBps: number;
  maxSlipBps?: number;
}

export interface GapFadeSpec {
  ticker: string;
  usdtEach: string;
  /** Buy when the best open rail is this many percent cheaper than Friday cash close. */
  discountPct: number;
  mode: QueueMode;
  maxSlipBps?: number;
}

export interface OpenPrintSpec {
  ticker: string;
  usdtEach: string;
  /** Absolute gap vs Friday, in percent, required inside the cash-open window. */
  minGapPct: number;
  /** Minutes after 09:30 ET during which the job may fire. */
  windowMin: number;
  maxSlipBps?: number;
}

export type JobSpec = DcaSpec | FlattenSpec | WeekendCapSpec | CheapRailSpec | GapFadeSpec | OpenPrintSpec;

export interface Job {
  id: string;
  name: string;
  type: JobType;
  paused: boolean;
  cadence: string;
  cron: string;
  lastAction?: string;
  lastAt?: number;
  createdAt: number;
  spec: JobSpec;
}

export interface TapeRow {
  id: string;
  at: number;
  side: Side;
  ticker: string;
  symbol: string;
  rail: Rail;
  usd: string;
  status: string;
  errorText?: string;
  txHash?: string;
  orderId?: string;
  vendorName?: string;
  source?: "user" | "agent";
}

export interface FridayPrint {
  ticker: string;
  close: number;
  sessionDate: string;
  source: string;
  storedAt: number;
  open?: number;
  priorClose?: number;
  priorOpen?: number;
  priorDate?: string;
  sessionOpen?: number;
  sessionOpenDate?: string;
}

export interface AgentBeat {
  at: number;
  status: "live" | "stopped";
  x402: "funded" | "low";
  x402Detail: string;
  identity: string;
}

export interface QueuedIntent {
  id: string;
  at: number;
  ticker: string;
  side: Side;
  usdt: string;
  railLock?: Rail;
  reason: string;
  jobId: string;
}

export type AgentStrategyType = "BASIS_TRADE" | "CROSS_ARB" | "CORRELATION";

export interface ArmedStrategy {
  id: string;
  type: AgentStrategyType;
  name: string;
  assetPairs: string[];
  targetSpread: number;
  targetPortfolioRatio?: number;
  volatilityDriftThreshold?: number;
  usdt: string;
  paused: boolean;
  createdAt: number;
  lastAction?: string;
  lastAt?: number;
}

export interface AgentFill {
  id: string;
  at: number;
  strategyId: string;
  strategyType: AgentStrategyType;
  ticker: string;
  side: Side;
  usdt: string;
  spreadPct: number | null;
  gasUsd: number | null;
  x402: "funded" | "low";
  x402Detail: string;
  status: "filled" | "skipped" | "failed";
  txHash?: string;
  note: string;
}

export const QUOTE_TTL_MS = 30_000;

export const RAILS: Rail[] = ["bStock", "ondo", "xStock"];

export const COPY = {
  emptySearch: "Name a company. We will price every BNB wrapper.",
  allClosed: "Cash hours bind this name right now. We will not invent a price.",
  quoteExpired: "That price is 30 seconds old. Requote.",
  killSwitch: "PARALLAX is paused. No sends.",
  connect: "Connect Binance Web3 Wallet. You will sign. We never hold keys.",
  fridayMissing: "Friday ref unavailable",
  priorMissing: "Prior cash close unavailable",
  disclaimer: "Not advice. Tokens are not shares. No voting. Dividends rebase.",
  strategies: "Jobs queue a signature. They never sign, never invent a closed-rail price, and never swap one wrapper for another.",
} as const;
