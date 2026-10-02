import { formatPct, formatPx } from "./amounts";
import { edgeBreakdown, type OpportunityCard } from "./opportunity";
import type { Rail, RailBook, Settings } from "./types";

export interface RiskLimits {
  minNetEdgePct: number;
  maxSlipPct: number;
  minLiquidityUsd: number;
  maxTradeUsdt: number;
  approvalRequired: boolean;
}

export function limitsFromSettings(settings: Settings | undefined, sizeUsdt: number): RiskLimits {
  return {
    minNetEdgePct: settings?.minNetEdgePct ?? 0.5,
    maxSlipPct: settings?.maxSlipPct ?? 0.5,
    minLiquidityUsd: settings?.minLiquidityUsd ?? 100_000,
    maxTradeUsdt: settings?.orderCapUsdt ?? Math.max(sizeUsdt, 1),
    approvalRequired: settings?.approvalRequired !== false,
  };
}

export function cardFromBook(
  ticker: string,
  name: string,
  book: RailBook,
  reference: number,
  referenceLabel: string,
  notionalUsd: number,
  liquidity = 0,
): OpportunityCard | null {
  const quote = book.best;
  if (!quote?.ok || !(reference > 0) || !(notionalUsd > 0)) return null;
  const edge = edgeBreakdown({
    perShare: quote.perShare,
    reference,
    slipBps: quote.slipBps50,
    slipKnown: quote.slipKnown,
    gasUsd: quote.gasUsd,
    notionalUsd,
  });
  if (!edge) return null;
  return {
    ticker,
    name,
    rail: book.wrapper.rail,
    symbol: book.wrapper.symbol,
    perShare: quote.perShare,
    reference,
    referenceLabel,
    grossPct: edge.grossPct,
    slipPct: edge.slipPct,
    costPct: edge.costPct,
    feePct: edge.feePct,
    netPct: edge.netPct,
    complete: edge.complete,
    liquidity,
    status: book.status,
    vendor: quote.vendorName,
    mode: quote.executionMode,
    errorText: book.errorText,
  };
}

export function evaluateLimits(card: OpportunityCard, limits: RiskLimits, sizeUsdt: number): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  if (card.status !== "OPEN") fails.push(`Rail is ${card.status}.`);
  if (Math.abs(card.netPct) < limits.minNetEdgePct) fails.push(`Net edge ${formatPct(card.netPct)} is below ${formatPct(limits.minNetEdgePct)}.`);
  if (card.complete && card.slipPct > limits.maxSlipPct) fails.push(`Slip ${formatPct(card.slipPct)} is above ${formatPct(limits.maxSlipPct)}.`);
  if (card.liquidity > 0 && card.liquidity < limits.minLiquidityUsd) fails.push(`Liquidity ${card.liquidity.toFixed(0)} is below ${limits.minLiquidityUsd}.`);
  if (sizeUsdt > limits.maxTradeUsdt) fails.push(`Size ${sizeUsdt} USDT is above the ${limits.maxTradeUsdt} cap.`);
  return { pass: fails.length === 0, fails };
}

export function flagReasons(input: {
  cashOpen: boolean;
  card: OpportunityCard | null;
  limits: RiskLimits;
  sizeUsdt: number;
}): string[] {
  const lines: string[] = [];
  lines.push(input.cashOpen ? "US equity market is in regular session." : "US equity market is closed.");
  lines.push("BNB Smart Chain remains open for tokenized wrappers.");
  if (!input.card) {
    lines.push("No executable wrapper quote is on the book yet.");
    return lines;
  }
  const card = input.card;
  lines.push(`${card.symbol} is ${formatPct(card.grossPct)} from ${card.referenceLabel} ${formatPx(card.reference)}.`);
  if (card.liquidity > 0) {
    lines.push(
      card.liquidity >= input.limits.minLiquidityUsd
        ? `Liquidity ${card.liquidity.toFixed(0)} is above the ${input.limits.minLiquidityUsd} minimum.`
        : `Liquidity ${card.liquidity.toFixed(0)} is below the ${input.limits.minLiquidityUsd} minimum.`,
    );
  } else {
    lines.push("Liquidity is not on this quote. The scan did not invent a book size.");
  }
  lines.push(card.complete ? `Estimated slippage is ${formatPct(card.slipPct)}.` : "Slippage was not measured on this size, so it was not subtracted.");
  lines.push(`Fees and gas reduce the gross gap by ${formatPct(card.costPct + card.feePct)}.`);
  lines.push(`Estimated executable net edge is ${formatPct(card.netPct)}.`);
  const gate = evaluateLimits(card, input.limits, input.sizeUsdt);
  lines.push(gate.pass ? "The opportunity passes the configured strategy threshold." : gate.fails.join(" "));
  return lines;
}

export type DemoScenarioId = "gap-closed" | "cross-wrapper" | "low-liq" | "low-edge" | "sim-ok" | "agent-watch";

export interface DemoScenario {
  id: DemoScenarioId;
  label: string;
  cashOpen: boolean;
  card: OpportunityCard;
  wrappers: Array<{ rail: Rail; symbol: string; perShare: number; grossPct: number }>;
}

const DEMO_REF = 178.42;

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "gap-closed",
    label: "US closed + tokenized gap",
    cashOpen: false,
    card: demoCard("NVDAx", "xStock", 181.17, 1.54, 1.2, 425_820, "OPEN"),
    wrappers: [
      { rail: "bStock", symbol: "NVDAB", perShare: 180.21, grossPct: 1.0 },
      { rail: "ondo", symbol: "NVDAon", perShare: 179.04, grossPct: 0.35 },
      { rail: "xStock", symbol: "NVDAx", perShare: 181.17, grossPct: 1.54 },
    ],
  },
  {
    id: "cross-wrapper",
    label: "Cross-wrapper discrepancy",
    cashOpen: false,
    card: demoCard("NVDAx", "xStock", 181.17, 1.54, 1.2, 425_820, "OPEN"),
    wrappers: [
      { rail: "bStock", symbol: "NVDAB", perShare: 180.21, grossPct: 1.0 },
      { rail: "ondo", symbol: "NVDAon", perShare: 179.04, grossPct: 0.35 },
      { rail: "xStock", symbol: "NVDAx", perShare: 181.17, grossPct: 1.54 },
    ],
  },
  {
    id: "low-liq",
    label: "Rejected: liquidity too low",
    cashOpen: false,
    card: demoCard("NVDAon", "ondo", 179.04, 0.35, 0.08, 12_000, "OPEN"),
    wrappers: [{ rail: "ondo", symbol: "NVDAon", perShare: 179.04, grossPct: 0.35 }],
  },
  {
    id: "low-edge",
    label: "Rejected: net edge below threshold",
    cashOpen: true,
    card: demoCard("NVDAon", "ondo", 178.9, 0.27, 0.04, 300_000, "OPEN"),
    wrappers: [{ rail: "ondo", symbol: "NVDAon", perShare: 178.9, grossPct: 0.27 }],
  },
  {
    id: "sim-ok",
    label: "Trade simulation succeeds",
    cashOpen: false,
    card: demoCard("NVDAB", "bStock", 180.21, 1.0, 0.73, 400_000, "OPEN"),
    wrappers: [{ rail: "bStock", symbol: "NVDAB", perShare: 180.21, grossPct: 1.0 }],
  },
  {
    id: "agent-watch",
    label: "Agent strategy detects an opportunity",
    cashOpen: false,
    card: demoCard("NVDAx", "xStock", 181.17, 1.54, 1.2, 425_820, "OPEN"),
    wrappers: [{ rail: "xStock", symbol: "NVDAx", perShare: 181.17, grossPct: 1.54 }],
  },
];

function demoCard(symbol: string, rail: Rail, perShare: number, grossPct: number, netPct: number, liquidity: number, status: OpportunityCard["status"]): OpportunityCard {
  return {
    ticker: "NVDA",
    name: "NVIDIA",
    rail,
    symbol,
    perShare,
    reference: DEMO_REF,
    referenceLabel: "demo reference",
    grossPct,
    slipPct: 0.18,
    costPct: 0.16,
    feePct: 0,
    netPct,
    complete: true,
    liquidity,
    status,
  };
}
