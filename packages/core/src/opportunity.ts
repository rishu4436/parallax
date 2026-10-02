import { gapPct } from "./router";
import type { Rail, RailStatus } from "./types";

/** Visible desk formula: NET EDGE = GROSS − SLIP − GAS − FEE. Missing legs stay 0 and mark the card incomplete. */
export interface EdgeInput {
  perShare: number;
  reference: number;
  slipBps: number;
  slipKnown: boolean;
  gasUsd: number;
  notionalUsd: number;
  feePct?: number | null;
}

export interface EdgeBreakdown {
  grossPct: number;
  slipPct: number;
  costPct: number;
  feePct: number;
  netPct: number;
  complete: boolean;
}

export function edgeBreakdown(input: EdgeInput): EdgeBreakdown | null {
  if (!(input.perShare > 0) || !(input.reference > 0) || !(input.notionalUsd > 0)) return null;
  const grossPct = gapPct(input.perShare, input.reference);
  if (grossPct == null) return null;
  const slipPct = input.slipKnown ? input.slipBps / 100 : 0;
  const costPct = input.gasUsd > 0 ? (input.gasUsd / input.notionalUsd) * 100 : 0;
  const feePct = input.feePct && input.feePct > 0 ? input.feePct : 0;
  return {
    grossPct,
    slipPct,
    costPct,
    feePct,
    netPct: grossPct - slipPct - costPct - feePct,
    complete: input.slipKnown,
  };
}

export interface OpportunityCard {
  ticker: string;
  name: string;
  rail: Rail;
  symbol: string;
  /** Null when this rail has no usable quote. */
  perShare: number | null;
  /** Underlying reference. Independent of whether this rail quoted. Null when unknown. */
  reference: number | null;
  referenceLabel: string;
  grossPct: number | null;
  /** Null when slippage was not measured. A calculated zero is a measured zero. */
  slipPct: number | null;
  costPct: number | null;
  feePct: number | null;
  netPct: number | null;
  complete: boolean;
  /** Null when volume was not observed. Zero means the print summed to zero. */
  liquidity: number | null;
  status: RailStatus;
  vendor?: string;
  mode?: string;
  errorText?: string;
  /** Live quote expiry. Absent when this card has no quote. */
  quoteExpiresAt?: number;
  networkFeeUsd?: number | null;
  gasEstimateUsd?: number | null;
  estimatedGasUnits?: string | null;
  priceImpactPct?: number | null;
  tradeFeeUsd?: number | null;
  multiplier?: number;
}

/** Missing and non-finite economics sort after every real measurement, including zero. */
function rankMagnitude(value: number | null): number {
  return value == null || !Number.isFinite(value) ? -1 : Math.abs(value);
}

export function rankOpportunities(rows: OpportunityCard[]): OpportunityCard[] {
  return [...rows].sort((a, b) => {
    const aOpen = a.status === "OPEN" ? 1 : 0;
    const bOpen = b.status === "OPEN" ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const net = rankMagnitude(b.netPct) - rankMagnitude(a.netPct);
    if (Math.abs(net) > 1e-9) return net;
    return rankMagnitude(b.liquidity) - rankMagnitude(a.liquidity);
  });
}

export function bestExecutable(rows: OpportunityCard[]): OpportunityCard | null {
  return rankOpportunities(rows).find((row) => row.status === "OPEN") ?? null;
}
