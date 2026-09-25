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
  perShare: number;
  reference: number;
  referenceLabel: string;
  grossPct: number;
  slipPct: number;
  costPct: number;
  feePct: number;
  netPct: number;
  complete: boolean;
  liquidity: number;
  status: RailStatus;
  vendor?: string;
  mode?: string;
  errorText?: string;
}

export function rankOpportunities(rows: OpportunityCard[]): OpportunityCard[] {
  return [...rows].sort((a, b) => {
    const aOpen = a.status === "OPEN" ? 1 : 0;
    const bOpen = b.status === "OPEN" ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const aAbs = Math.abs(a.netPct);
    const bAbs = Math.abs(b.netPct);
    if (Math.abs(aAbs - bAbs) > 1e-9) return bAbs - aAbs;
    return b.liquidity - a.liquidity;
  });
}

export function bestExecutable(rows: OpportunityCard[]): OpportunityCard | null {
  return rankOpportunities(rows).find((row) => row.status === "OPEN") ?? null;
}
