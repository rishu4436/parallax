import { formatPct } from "./amounts";
import { limitsFromSettings } from "./flag";
import { edgeBreakdown } from "./opportunity";
import {
  RouterReject,
  WALLET_MISMATCH,
  needsSignerQuote,
  plainSimulate,
  signerMatchesQuote,
  type ConfirmGate,
} from "./router";
import type { Intent, Settings, VenueQuote } from "./types";
import { COPY, type RouterState } from "./types";

export const POLICY_VERDICTS = ["PASS", "BLOCK", "REQUOTE", "WAIT"] as const;
export type PolicyVerdict = (typeof POLICY_VERDICTS)[number];

export const POLICY_SOURCES = ["ui", "strategy", "agentic", "mcp", "studio"] as const;
export type PolicySource = (typeof POLICY_SOURCES)[number];

export const POLICY_MODES = ["preview", "execute"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export const POLICY_CHECK_IDS = [
  "kill_switch",
  "allowed_rail",
  "order_cap",
  "daily_cap",
  "min_net_edge",
  "max_slippage",
  "min_liquidity",
  "quote_age",
  "market_status",
  "signer",
  "simulation",
] as const;
export type PolicyCheckId = (typeof POLICY_CHECK_IDS)[number];

export type PolicyCode =
  | "OK"
  | "KILL_SWITCH"
  | "RAIL_DISABLED"
  | "AMOUNT_INVALID"
  | "ORDER_CAP"
  | "DAILY_CAP"
  | "MIN_NET_EDGE"
  | "MAX_SLIPPAGE"
  | "MIN_LIQUIDITY"
  | "QUOTE_MISSING"
  | "QUOTE_EXPIRED"
  | "MARKET_CLOSED"
  | "MARKET_HALTED"
  | "MARKET_OFFLINE"
  | "WALLET_MISSING"
  | "WALLET_MISMATCH"
  | "SIM_REQUIRED"
  | "SIM_FAILED"
  | "SIM_PENDING";

export type PolicyNextAction =
  | "none"
  | "clear_kill_switch"
  | "enable_rail"
  | "reduce_size"
  | "wait_session"
  | "requote"
  | "connect_wallet"
  | "requote_with_signer"
  | "simulate"
  | "approve"
  | "sign";

export interface PolicyFailure {
  code: PolicyCode;
  human: string;
  machine: string;
  nextAction: PolicyNextAction;
}

export interface PolicyCheck {
  id: PolicyCheckId;
  pass: boolean;
  verdict: PolicyVerdict;
  failure?: PolicyFailure;
}

export interface PolicyProposal {
  source: PolicySource;
  mode?: PolicyMode;
  intent: Intent;
  settings: Settings;
  spentToday: number;
  now?: number;
  quote?: VenueQuote | null;
  signer?: string | null;
  reference?: { price: number | null; label?: string };
  liquidity?: number;
  simulateStatus?: "SUCCESS" | "FAILED" | "PENDING" | "NONE";
  simulateReason?: string;
  prepareStep?: "rejected" | "expired" | "approve" | "sign-rfq" | "sign-swap";
  /** False for baw market-order (no EVM tx). SWAP Web3 sends stay required. */
  requireSimulation?: boolean;
}

export interface PolicyPublicCheck {
  id: PolicyCheckId;
  pass: boolean;
  verdict: PolicyVerdict;
  code: PolicyCode;
  human: string;
  machine: string;
  nextAction: PolicyNextAction;
}

export interface PolicyPublic {
  verdict: PolicyVerdict;
  source: PolicySource;
  mode: PolicyMode;
  nextAction: PolicyNextAction;
  primary: PolicyFailure | null;
  failures: PolicyFailure[];
  checks: PolicyPublicCheck[];
}

export interface PolicyDecision {
  verdict: PolicyVerdict;
  source: PolicySource;
  mode: PolicyMode;
  checks: PolicyCheck[];
  failures: PolicyFailure[];
  primary?: PolicyFailure;
  nextAction: PolicyNextAction;
}

const HALTED = new Set([40365, 40368, 40370, 40374, 40375]);
const CLOSED = new Set([40367, 40369]);
const RANK: Record<PolicyVerdict, number> = { BLOCK: 3, REQUOTE: 2, WAIT: 1, PASS: 0 };

export function sourceFromActor(actor?: "user" | "agent", fallback: PolicySource = "ui"): PolicySource {
  if (actor === "agent") return fallback === "ui" ? "agentic" : fallback;
  return fallback;
}

export function policyAllowsSend(decision: PolicyDecision): boolean {
  return decision.verdict === "PASS";
}

export function policyAllowsApprove(decision: PolicyDecision): boolean {
  return decision.nextAction === "approve";
}

export function policyPublic(decision: PolicyDecision): PolicyPublic {
  return {
    verdict: decision.verdict,
    source: decision.source,
    mode: decision.mode,
    nextAction: decision.nextAction,
    primary: decision.primary ?? null,
    failures: decision.failures,
    checks: decision.checks.map((row) => ({
      id: row.id,
      pass: row.pass,
      verdict: row.verdict,
      code: row.failure?.code ?? "OK",
      human: row.failure?.human ?? "pass",
      machine: row.failure?.machine ?? `${row.id}=pass`,
      nextAction: row.failure?.nextAction ?? "none",
    })),
  };
}

export function blockedBuildMessage(decision: PolicyDecision): string | null {
  if (decision.verdict === "BLOCK") return decision.primary?.human || "Policy blocked this execution.";
  if (decision.primary?.code === "MARKET_CLOSED") return decision.primary.human;
  return null;
}

export function evaluatePolicy(proposal: PolicyProposal): PolicyDecision {
  const now = proposal.now ?? Date.now();
  const mode = proposal.mode ?? "preview";
  const actor = proposal.intent.actor === "agent" ? "agent" : "user";
  const quote = proposal.quote ?? null;
  const rail = quote?.wrapper.rail ?? proposal.intent.railLock;
  const checks: PolicyCheck[] = [
    checkKill(proposal.settings),
    checkRail(proposal.settings, rail),
    checkOrderCap(proposal.intent, proposal.settings, actor),
    checkDailyCap(proposal.intent, proposal.settings, proposal.spentToday, actor),
    checkMarket(quote, mode),
    checkQuoteAge(quote, now, mode),
    checkEdge(proposal, quote),
    checkSlip(proposal, quote),
    checkLiquidity(proposal),
    checkSigner(proposal, quote, mode),
    checkSimulation(proposal, quote, mode),
  ];
  const failures = checks.filter((row) => !row.pass && row.failure).map((row) => row.failure as PolicyFailure);
  let verdict: PolicyVerdict = "PASS";
  let primary: PolicyFailure | undefined;
  for (const row of checks) {
    if (row.pass || !row.failure) continue;
    if (RANK[row.verdict] > RANK[verdict]) {
      verdict = row.verdict;
      primary = row.failure;
    } else if (RANK[row.verdict] === RANK[verdict] && !primary) {
      primary = row.failure;
    }
  }
  return {
    verdict,
    source: proposal.source,
    mode,
    checks,
    failures,
    primary,
    nextAction: primary?.nextAction ?? (verdict === "PASS" ? "sign" : "none"),
  };
}

function pass(id: PolicyCheckId): PolicyCheck {
  return { id, pass: true, verdict: "PASS" };
}

function fail(id: PolicyCheckId, verdict: PolicyVerdict, failure: PolicyFailure): PolicyCheck {
  return { id, pass: false, verdict, failure };
}

function checkKill(settings: Settings): PolicyCheck {
  if (!settings.killSwitch) return pass("kill_switch");
  return fail("kill_switch", "BLOCK", {
    code: "KILL_SWITCH",
    human: COPY.killSwitch,
    machine: "killSwitch=true",
    nextAction: "clear_kill_switch",
  });
}

function checkRail(settings: Settings, rail?: VenueQuote["wrapper"]["rail"]): PolicyCheck {
  if (!rail) return pass("allowed_rail");
  if (settings.allowedRails.includes(rail)) return pass("allowed_rail");
  return fail("allowed_rail", "BLOCK", {
    code: "RAIL_DISABLED",
    human: `${rail} is turned off in Settings.`,
    machine: `rail=${rail} allowed=${settings.allowedRails.join(",")}`,
    nextAction: "enable_rail",
  });
}

function checkOrderCap(intent: Intent, settings: Settings, actor: "user" | "agent"): PolicyCheck {
  const usdt = Number(intent.usdt);
  if (!Number.isFinite(usdt) || usdt <= 0) {
    return fail("order_cap", "BLOCK", {
      code: "AMOUNT_INVALID",
      human: "Amount must be greater than zero.",
      machine: `usdt=${intent.usdt}`,
      nextAction: "reduce_size",
    });
  }
  if (actor === "user") return pass("order_cap");
  if (usdt <= settings.orderCapUsdt) return pass("order_cap");
  return fail("order_cap", "BLOCK", {
    code: "ORDER_CAP",
    human: `Order cap is ${settings.orderCapUsdt} USDT.`,
    machine: `usdt=${usdt} orderCapUsdt=${settings.orderCapUsdt} actor=${actor}`,
    nextAction: "reduce_size",
  });
}

function checkDailyCap(intent: Intent, settings: Settings, spentToday: number, actor: "user" | "agent"): PolicyCheck {
  const usdt = Number(intent.usdt);
  if (!Number.isFinite(usdt) || usdt <= 0) return pass("daily_cap");
  if (actor === "user") return pass("daily_cap");
  if (spentToday + usdt <= settings.dailyCapUsdt) return pass("daily_cap");
  return fail("daily_cap", "BLOCK", {
    code: "DAILY_CAP",
    human: `Daily cap is ${settings.dailyCapUsdt} USDT. ${spentToday.toFixed(2)} already sent today.`,
    machine: `usdt=${usdt} spentToday=${spentToday} dailyCapUsdt=${settings.dailyCapUsdt}`,
    nextAction: "reduce_size",
  });
}

function checkMarket(quote: VenueQuote | null, mode: PolicyMode): PolicyCheck {
  if (!quote) return mode === "execute" ? fail("market_status", "REQUOTE", missingQuote()) : pass("market_status");
  if (quote.ok) return pass("market_status");
  if (quote.errorCode && CLOSED.has(quote.errorCode)) {
    return fail("market_status", "WAIT", {
      code: "MARKET_CLOSED",
      human: quote.errorText || `${quote.errorCode} US hours`,
      machine: `errorCode=${quote.errorCode} rail=${quote.wrapper.rail}`,
      nextAction: "wait_session",
    });
  }
  if (quote.errorCode && HALTED.has(quote.errorCode)) {
    return fail("market_status", "BLOCK", {
      code: "MARKET_HALTED",
      human: quote.errorText || `Rail halted (${quote.errorCode}).`,
      machine: `errorCode=${quote.errorCode} rail=${quote.wrapper.rail}`,
      nextAction: "none",
    });
  }
  return fail("market_status", "REQUOTE", {
    code: "MARKET_OFFLINE",
    human: quote.errorText || "Quote failed",
    machine: `errorCode=${quote.errorCode ?? "none"} rail=${quote.wrapper.rail} ok=false`,
    nextAction: "requote",
  });
}

function checkQuoteAge(quote: VenueQuote | null, now: number, mode: PolicyMode): PolicyCheck {
  if (!quote) return mode === "execute" ? fail("quote_age", "REQUOTE", missingQuote()) : pass("quote_age");
  if (!quote.ok) return pass("quote_age");
  if (now >= quote.quoteExpiresAt) {
    return fail("quote_age", "REQUOTE", {
      code: "QUOTE_EXPIRED",
      human: COPY.quoteExpired,
      machine: `now=${now} expiresAt=${quote.quoteExpiresAt} quoteId=${quote.quoteId || "none"}`,
      nextAction: "requote",
    });
  }
  return pass("quote_age");
}

function checkEdge(proposal: PolicyProposal, quote: VenueQuote | null): PolicyCheck {
  if (!quote?.ok) return pass("min_net_edge");
  const usdt = Number(proposal.intent.usdt);
  const reference = proposal.reference?.price && proposal.reference.price > 0 ? proposal.reference.price : null;
  if (!reference || !(usdt > 0)) return pass("min_net_edge");
  const edge = edgeBreakdown({
    perShare: quote.perShare,
    reference,
    slipBps: quote.slipBps50,
    slipKnown: quote.slipKnown,
    gasUsd: quote.gasUsd,
    notionalUsd: usdt,
  });
  if (!edge) return pass("min_net_edge");
  const limits = limitsFromSettings(proposal.settings, usdt);
  if (Math.abs(edge.netPct) >= limits.minNetEdgePct) return pass("min_net_edge");
  return fail("min_net_edge", "BLOCK", {
    code: "MIN_NET_EDGE",
    human: `Net edge ${formatPct(edge.netPct)} is below ${formatPct(limits.minNetEdgePct)}.`,
    machine: `netPct=${edge.netPct} minNetEdgePct=${limits.minNetEdgePct} perShare=${quote.perShare} reference=${reference}`,
    nextAction: "none",
  });
}

function checkSlip(proposal: PolicyProposal, quote: VenueQuote | null): PolicyCheck {
  if (!quote?.ok || !quote.slipKnown) return pass("max_slippage");
  const usdt = Number(proposal.intent.usdt);
  const limits = limitsFromSettings(proposal.settings, Number.isFinite(usdt) ? usdt : 0);
  const slipPct = quote.slipBps50 / 100;
  if (slipPct <= limits.maxSlipPct) return pass("max_slippage");
  return fail("max_slippage", "BLOCK", {
    code: "MAX_SLIPPAGE",
    human: `Slip ${formatPct(slipPct)} is above ${formatPct(limits.maxSlipPct)}.`,
    machine: `slipBps50=${quote.slipBps50} maxSlipPct=${limits.maxSlipPct}`,
    nextAction: "requote",
  });
}

function checkLiquidity(proposal: PolicyProposal): PolicyCheck {
  const liquidity = proposal.liquidity ?? 0;
  if (!(liquidity > 0)) return pass("min_liquidity");
  const usdt = Number(proposal.intent.usdt);
  const limits = limitsFromSettings(proposal.settings, Number.isFinite(usdt) ? usdt : 0);
  if (liquidity >= limits.minLiquidityUsd) return pass("min_liquidity");
  return fail("min_liquidity", "BLOCK", {
    code: "MIN_LIQUIDITY",
    human: `Liquidity ${liquidity.toFixed(0)} is below ${limits.minLiquidityUsd}.`,
    machine: `liquidity=${liquidity} minLiquidityUsd=${limits.minLiquidityUsd}`,
    nextAction: "none",
  });
}

function checkSigner(proposal: PolicyProposal, quote: VenueQuote | null, mode: PolicyMode): PolicyCheck {
  const signer = proposal.signer || proposal.intent.wallet;
  if (!quote?.ok) return pass("signer");
  if (quote.userWalletAddress && signer && !signerMatchesQuote(signer, quote.userWalletAddress)) {
    return fail("signer", "REQUOTE", {
      code: "WALLET_MISMATCH",
      human: WALLET_MISMATCH,
      machine: `signer=${signer} quotedWallet=${quote.userWalletAddress}`,
      nextAction: "requote_with_signer",
    });
  }
  if (mode === "execute" && !signer) {
    return fail("signer", "WAIT", {
      code: "WALLET_MISSING",
      human: COPY.connect,
      machine: "signer=missing",
      nextAction: "connect_wallet",
    });
  }
  if (mode === "execute" && needsSignerQuote(quote) && !signer) {
    return fail("signer", "WAIT", {
      code: "WALLET_MISSING",
      human: COPY.connect,
      machine: `rail=${quote.wrapper.rail} executionMode=${quote.executionMode || "none"}`,
      nextAction: "connect_wallet",
    });
  }
  return pass("signer");
}

function checkSimulation(proposal: PolicyProposal, quote: VenueQuote | null, mode: PolicyMode): PolicyCheck {
  if (proposal.requireSimulation === false) return pass("simulation");
  if (!quote?.ok) return pass("simulation");
  if (proposal.prepareStep === "rejected" || proposal.prepareStep === "expired") return pass("simulation");
  if (proposal.prepareStep === "approve") {
    if (proposal.source === "ui") {
      return fail("simulation", "WAIT", {
        code: "SIM_PENDING",
        human: "Token approval is required before the swap.",
        machine: "prepareStep=approve",
        nextAction: "approve",
      });
    }
    return pass("simulation");
  }
  if (proposal.prepareStep === "sign-rfq" || quote.executionMode === "RFQ") return pass("simulation");
  if (mode === "preview") return pass("simulation");
  const status = proposal.simulateStatus || (proposal.prepareStep === "sign-swap" ? "NONE" : undefined);
  if (status === "SUCCESS") return pass("simulation");
  if (status === "FAILED") {
    return fail("simulation", "REQUOTE", {
      code: "SIM_FAILED",
      human: plainSimulate(proposal.simulateReason || "Simulation failed"),
      machine: `simulateStatus=FAILED reason=${proposal.simulateReason || "none"}`,
      nextAction: "requote",
    });
  }
  if (status === "PENDING") {
    return fail("simulation", "WAIT", {
      code: "SIM_PENDING",
      human: "Waiting on simulate.",
      machine: "simulateStatus=PENDING",
      nextAction: "simulate",
    });
  }
  return fail("simulation", "WAIT", {
    code: "SIM_REQUIRED",
    human: "Waiting on simulate.",
    machine: `simulateStatus=${status || "NONE"} executionMode=${quote?.executionMode || "none"}`,
    nextAction: "simulate",
  });
}

function missingQuote(): PolicyFailure {
  return {
    code: "QUOTE_MISSING",
    human: "No executable quote is on the book.",
    machine: "quote=null",
    nextAction: "requote",
  };
}

const PERMISSIVE_SETTINGS: Settings = {
  orderCapUsdt: 1_000_000,
  dailyCapUsdt: 1_000_000,
  allowedRails: ["bStock", "ondo", "xStock"],
  killSwitch: false,
  minNetEdgePct: 0,
  maxSlipPct: 100,
  minLiquidityUsd: 0,
  approvalRequired: true,
};

/** Kill switch, size, rails, and agent caps. Full execution gate is evaluatePolicy. */
export function assertBuildAllowed(intent: Intent, settings: Settings, spentTodayUsdt: number): void {
  const decision = evaluatePolicy({
    source: intent.actor === "agent" ? "strategy" : "ui",
    mode: "preview",
    intent,
    settings,
    spentToday: spentTodayUsdt,
  });
  const hard = decision.failures.find(
    (row) =>
      row.code === "KILL_SWITCH" ||
      row.code === "RAIL_DISABLED" ||
      row.code === "AMOUNT_INVALID" ||
      row.code === "ORDER_CAP" ||
      row.code === "DAILY_CAP",
  );
  if (hard) throw new RouterReject(hard.human);
}

/** Sign modal gate. Quote age and simulation go through evaluatePolicy. */
export function confirmGate(input: {
  now: number;
  quoteExpiresAt: number;
  simulateStatus?: "SUCCESS" | "FAILED" | "PENDING" | "NONE";
  simulateReason?: string;
  executionMode?: "SWAP" | "RFQ";
  state: RouterState;
}): ConfirmGate {
  const expired = input.state === "expired" || input.now >= input.quoteExpiresAt;
  const wallet = "0x0000000000000000000000000000000000000001" as const;
  const decision = evaluatePolicy({
    source: "ui",
    mode: "execute",
    now: input.now,
    intent: { ticker: "NVDA", side: "buy", usdt: "1", wallet, actor: "user" },
    settings: PERMISSIVE_SETTINGS,
    spentToday: 0,
    quote: {
      wrapper: { rail: "xStock", type: 2, symbol: "NVDAx", address: wallet, decimals: 18, multiplier: 1 },
      ok: true,
      executionMode: input.executionMode,
      quoteExpiresAt: input.quoteExpiresAt,
      inAmount: "1",
      outAmount: "1",
      mid: 100,
      perShare: 100,
      slipBps50: 0,
      slipBps500: 0,
      slipKnown: false,
      gasUsd: 0,
      userWalletAddress: wallet,
      raw: {},
    },
    signer: wallet,
    simulateStatus: input.simulateStatus,
    simulateReason: input.simulateReason,
  });
  if (expired || decision.primary?.code === "QUOTE_EXPIRED") {
    return { sign: false, requote: true, cancel: true, expired: true, reason: COPY.quoteExpired };
  }
  if (decision.verdict === "PASS") return { sign: true, requote: true, cancel: true, expired: false };
  return {
    sign: false,
    requote: true,
    cancel: true,
    expired: false,
    reason: decision.primary?.human,
  };
}
