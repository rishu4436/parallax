import { canonicalHash, canonicalJson } from "./canonical";
import type { SigningCommitment } from "./commitment";
import {
  evaluatePolicy,
  resolveExecutionRequirement,
  type ExecutionRequirement,
  type PolicyDecision,
  type PolicySource,
} from "./policy";
import type { ExecutionReceipt } from "./receipt";
import { plainSimulate } from "./router";
import type { Address, ExecMode, Intent, Rail, RailBook, Settings, Side, VenueQuote } from "./types";
import { COPY, QUOTE_TTL_MS } from "./types";

export const PASSPORT_STATES = [
  "quoted",
  "incomplete",
  "expired",
  "rail_closed",
  "offline",
  "rejected",
  "needs_approval",
  "sim_failed",
  "ready",
] as const;

export type PassportState = (typeof PASSPORT_STATES)[number];

export type PassportCheckId =
  | "allowed_rail"
  | "daily_cap"
  | "kill_switch"
  | "max_slippage"
  | "min_liquidity"
  | "min_net_edge"
  | "order_cap"
  | "quote_age"
  | "market_status"
  | "signer"
  | "simulation";

export interface PassportCheck {
  id: PassportCheckId;
  pass: boolean;
  detail: string;
}

export interface PassportSimulation {
  status: "NONE" | "SUCCESS" | "FAILED";
  reason?: string;
  step?: "rejected" | "expired" | "approve" | "sign-rfq" | "sign-swap";
}

/** Prepare facts the passport may hash. Calldata and typed data are dropped. */
export interface PassportPrepare {
  step: "rejected" | "expired" | "approve" | "sign-rfq" | "sign-swap";
  message?: string;
  simulateStatus?: "SUCCESS" | "FAILED";
  simulateReason?: string;
}

export interface PassportIntent {
  ticker: string;
  side: Side;
  usdt: string;
  railLock?: Rail;
  vendorLock?: string;
  wallet: Address;
  actor: "user" | "agent";
}

export interface PassportBody {
  intent: PassportIntent;
  underlying: { ticker: string; name: string };
  representation: {
    rail: Rail;
    type: 1 | 2 | 3;
    symbol: string;
    address: Address;
    decimals: number;
    multiplier: number;
  };
  quote: {
    quoteId?: string;
    ok: boolean;
    errorCode?: number;
    errorText?: string;
    perShare: number;
    mid: number;
    inAmount: string;
    outAmount: string;
    slipBps50: number;
    slipBps500: number;
    slipKnown: boolean;
  };
  vendor: string | null;
  executionMode: ExecMode | null;
  quotedAt: number;
  expiresAt: number;
  reference: { price: number | null; label: string };
  multiplier: number;
  networkFeeUsd: number | null;
  gasEstimateUsd: number | null;
  gasPrice: string | null;
  estimatedGasUnits: string | null;
  priceImpactPct: number | null;
  tradeFeeUsd: number | null;
  executionRequirement: ExecutionRequirement;
  policy: PassportCheck[];
  simulation: PassportSimulation;
}

export interface ExecutionPassport {
  hash: string;
  canonical: string;
  issuedAt: number;
  state: PassportState;
  reason: string;
  body: PassportBody;
  gate?: PolicyDecision;
  commitment?: SigningCommitment;
  receipt?: ExecutionReceipt;
}

export interface PassportBook {
  underlying: { ticker: string; name: string };
  books: RailBook[];
  best: RailBook | null;
  fridayClose: number | null;
  priorClose: number | null;
  referencePrice?: number | null;
}

export interface IssuePassportInput {
  intent: Intent;
  quote: VenueQuote;
  underlying: { ticker: string; name: string };
  reference: { price: number | null; label: string };
  settings: Settings;
  spentToday: number;
  now?: number;
  prepare?: unknown;
  liquidity?: number;
  source?: PolicySource;
  signer?: string | null;
  executionRequirement?: ExecutionRequirement;
}

const HARD_CHECKS: PassportCheckId[] = ["kill_switch", "allowed_rail", "order_cap", "daily_cap"];
const LIMIT_CHECKS: PassportCheckId[] = ["min_net_edge", "max_slippage", "min_liquidity"];

/**
 * Strip a PrepareResult (or any extra object) down to hashable simulation facts.
 * Unsigned tx calldata and RFQ typed data never enter the passport.
 */
export function prepareSnapshot(prepare: unknown): PassportPrepare | undefined {
  if (!prepare || typeof prepare !== "object") return undefined;
  const row = prepare as Record<string, unknown>;
  const step = row.step;
  if (step !== "rejected" && step !== "expired" && step !== "approve" && step !== "sign-rfq" && step !== "sign-swap") {
    return undefined;
  }
  const snap: PassportPrepare = { step };
  if (typeof row.message === "string") snap.message = row.message;
  if (row.simulateStatus === "SUCCESS" || row.simulateStatus === "FAILED") snap.simulateStatus = row.simulateStatus;
  if (typeof row.simulateReason === "string") snap.simulateReason = row.simulateReason;
  return snap;
}

export function selectQuote(book: PassportBook, railLock?: Rail): VenueQuote | null {
  const preferred = railLock ? book.books.find((row) => row.wrapper.rail === railLock) : book.best;
  const row = preferred || book.best || book.books.find((item) => item.best) || book.books[0];
  if (!row) return null;
  return row.best || row.routes.find((route) => route.ok) || row.routes[0] || null;
}

export function referenceFromBook(book: PassportBook): { price: number | null; label: string } {
  if (book.priorClose && book.priorClose > 0) return { price: book.priorClose, label: "prior cash close" };
  if (book.fridayClose && book.fridayClose > 0) return { price: book.fridayClose, label: "Friday cash close" };
  if (book.referencePrice && book.referencePrice > 0) return { price: book.referencePrice, label: "RWA reference" };
  return { price: null, label: "unavailable" };
}

export function passportFromBook(input: {
  intent: Intent;
  book: PassportBook;
  settings: Settings;
  spentToday: number;
  now?: number;
  prepare?: unknown;
  liquidity?: number;
  source?: PolicySource;
  signer?: string | null;
  executionRequirement?: ExecutionRequirement;
}): ExecutionPassport | null {
  const quote = selectQuote(input.book, input.intent.railLock);
  if (!quote) return null;
  return issuePassport({
    intent: input.intent,
    quote,
    underlying: input.book.underlying,
    reference: referenceFromBook(input.book),
    settings: input.settings,
    spentToday: input.spentToday,
    now: input.now,
    prepare: input.prepare,
    liquidity: input.liquidity,
    source: input.source,
    signer: input.signer,
    executionRequirement: input.executionRequirement,
  });
}

export function issuePassport(input: IssuePassportInput): ExecutionPassport {
  const now = input.now ?? Date.now();
  const quote = input.quote;
  const actor = input.intent.actor === "agent" ? "agent" : "user";
  const wallet = input.intent.wallet.toLowerCase() as Address;
  const expiresAt = quote.quoteExpiresAt;
  const quotedAt = expiresAt - QUOTE_TTL_MS;
  const referencePrice = input.reference.price && input.reference.price > 0 ? input.reference.price : null;
  const costs = costsFromQuote(quote, input.prepare);
  const snap = prepareSnapshot(input.prepare);
  const simulation = simulationFromPrepare(snap);
  const source = input.source ?? (actor === "agent" ? "agentic" : "ui");
  const executionRequirement = resolveExecutionRequirement({
    executionRequirement: input.executionRequirement,
    prepareStep: snap?.step,
    quote,
  });
  const gate = evaluatePolicy({
    source,
    mode: snap ? "execute" : "preview",
    now,
    intent: { ...input.intent, actor },
    settings: input.settings,
    spentToday: input.spentToday,
    quote,
    signer: input.signer ?? wallet,
    reference: { price: referencePrice, label: input.reference.label },
    liquidity: input.liquidity,
    simulateStatus: snap?.simulateStatus ?? (snap?.step === "sign-rfq" ? "NONE" : simulation.status),
    simulateReason: snap?.simulateReason ?? simulation.reason,
    prepareStep: snap?.step,
    executionRequirement,
  });
  const policy = gate.checks.map((row) => ({
    id: row.id as PassportCheckId,
    pass: row.pass,
    detail: row.failure?.human || "pass",
  }));
  const body: PassportBody = {
    intent: {
      ticker: input.intent.ticker.toUpperCase(),
      side: input.intent.side,
      usdt: input.intent.usdt,
      ...(input.intent.railLock ? { railLock: input.intent.railLock } : {}),
      ...(input.intent.vendorLock ? { vendorLock: input.intent.vendorLock } : {}),
      wallet,
      actor,
    },
    underlying: { ticker: input.underlying.ticker, name: input.underlying.name },
    representation: {
      rail: quote.wrapper.rail,
      type: quote.wrapper.type,
      symbol: quote.wrapper.symbol,
      address: quote.wrapper.address.toLowerCase() as Address,
      decimals: quote.wrapper.decimals,
      multiplier: quote.wrapper.multiplier,
    },
    quote: {
      ...(quote.quoteId ? { quoteId: quote.quoteId } : {}),
      ok: quote.ok,
      ...(quote.errorCode != null ? { errorCode: quote.errorCode } : {}),
      ...(quote.errorText ? { errorText: quote.errorText } : {}),
      perShare: quote.perShare,
      mid: quote.mid,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      slipBps50: quote.slipBps50,
      slipBps500: quote.slipBps500,
      slipKnown: quote.slipKnown,
    },
    vendor: quote.vendorName || null,
    executionMode: quote.executionMode ?? null,
    quotedAt,
    expiresAt,
    reference: { price: referencePrice, label: input.reference.label },
    multiplier: quote.wrapper.multiplier,
    networkFeeUsd: costs.networkFeeUsd,
    gasEstimateUsd: costs.gasEstimateUsd,
    gasPrice: costs.gasPrice,
    estimatedGasUnits: costs.estimatedGasUnits,
    priceImpactPct: costs.priceImpactPct,
    tradeFeeUsd: costs.tradeFeeUsd,
    executionRequirement,
    policy,
    simulation,
  };
  const canonical = canonicalJson(body);
  const state = derivePassportState(body, now);
  return {
    hash: canonicalHash(body),
    canonical,
    issuedAt: now,
    state,
    reason: stateReason(body, state),
    body,
    gate,
  };
}

export function refreshPassport(passport: ExecutionPassport, now = Date.now()): ExecutionPassport {
  const state = derivePassportState(passport.body, now);
  return { ...passport, state, reason: stateReason(passport.body, state) };
}

export function derivePassportState(body: PassportBody, now: number): PassportState {
  if (!body.quote.ok) {
    if (body.quote.errorCode === 40367 || body.quote.errorCode === 40369) return "rail_closed";
    return "offline";
  }
  if (now >= body.expiresAt) return "expired";
  if (body.policy.some((check) => HARD_CHECKS.includes(check.id) && !check.pass)) return "rejected";
  const sim = body.simulation;
  if (sim.step === "rejected") return "rejected";
  if (sim.step === "expired") return "expired";
  if (sim.step === "approve") return "needs_approval";
  if (sim.status === "FAILED") return "sim_failed";
  if (body.policy.some((check) => LIMIT_CHECKS.includes(check.id) && !check.pass)) return "rejected";
  if (!body.quote.slipKnown || body.reference.price == null) return "incomplete";
  if (body.executionRequirement === "AGENTIC_MARKET") return "ready";
  if (sim.step === "sign-rfq" || body.executionRequirement === "RFQ") return sim.step === "sign-rfq" ? "ready" : "quoted";
  if (sim.step === "sign-swap" && sim.status === "SUCCESS") return "ready";
  return "quoted";
}

export function shortPassportHash(hash: string): string {
  return hash.slice(0, 12);
}

function simulationFromPrepare(prepare?: PassportPrepare): PassportSimulation {
  if (!prepare) return { status: "NONE" };
  if (prepare.step === "sign-rfq") {
    return { status: "NONE", step: "sign-rfq", ...(prepare.message ? { reason: prepare.message } : {}) };
  }
  if (prepare.step === "sign-swap") {
    return {
      status: prepare.simulateStatus === "FAILED" ? "FAILED" : prepare.simulateStatus === "SUCCESS" ? "SUCCESS" : "NONE",
      step: "sign-swap",
      ...(prepare.simulateReason || prepare.message ? { reason: prepare.simulateReason || prepare.message } : {}),
    };
  }
  return {
    status: "NONE",
    step: prepare.step,
    ...(prepare.message ? { reason: prepare.message } : {}),
  };
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  return text.length ? text : null;
}

function costsFromQuote(quote: VenueQuote, prepare?: unknown): {
  networkFeeUsd: number | null;
  gasEstimateUsd: number | null;
  gasPrice: string | null;
  estimatedGasUnits: string | null;
  priceImpactPct: number | null;
  tradeFeeUsd: number | null;
} {
  const raw = quote.raw && typeof quote.raw === "object" ? (quote.raw as Record<string, unknown>) : {};
  const tx =
    prepare && typeof prepare === "object" && "tx" in prepare && prepare.tx && typeof prepare.tx === "object"
      ? (prepare.tx as Record<string, unknown>)
      : {};
  const networkFeeUsd = quote.networkFeeUsd ?? finiteOrNull(raw.tradeFee);
  return {
    networkFeeUsd,
    gasEstimateUsd: quote.gasEstimateUsd ?? null,
    gasPrice: quote.gasPrice ?? stringOrNull(tx.gasPrice) ?? stringOrNull(raw.gasPrice),
    estimatedGasUnits: quote.estimatedGasUnits ?? stringOrNull(tx.gas) ?? stringOrNull(raw.estimateGasFee),
    priceImpactPct: quote.priceImpactPct ?? finiteOrNull(raw.priceImpactPercent),
    tradeFeeUsd: quote.tradeFeeUsd ?? finiteOrNull(raw.feeAmount),
  };
}

function stateReason(body: PassportBody, state: PassportState): string {
  if (state === "quoted") return "Live quote. Simulation has not run.";
  if (state === "incomplete") {
    if (body.reference.price == null) return "Reference price unavailable.";
    return "Slippage was not measured on this size.";
  }
  if (state === "expired") return COPY.quoteExpired;
  if (state === "rail_closed") return body.quote.errorText || `${body.quote.errorCode || "40367"} US hours`;
  if (state === "offline") return body.quote.errorText || "Quote failed";
  if (state === "rejected") {
    const failed = body.policy.find((check) => !check.pass && (HARD_CHECKS.includes(check.id) || LIMIT_CHECKS.includes(check.id)));
    return failed?.detail || body.simulation.reason || "Policy rejected this passport.";
  }
  if (state === "needs_approval") return "Token approval is required before the swap.";
  if (state === "sim_failed") return plainSimulate(body.simulation.reason || "Simulation failed");
  return "Ready for the wallet to sign.";
}
