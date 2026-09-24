import type { ArmedStrategy } from "../types";
import { BaseStrategy, type MarketData, type RWAData } from "./BaseStrategy";

/**
 * Crypto versus equity drift.
 * currentPrice is the equity percent change versus its cash reference.
 * referencePrice is the BNB 24h percent change.
 * A clip fires when those two changes diverge by the drift threshold.
 */
export class Correlation extends BaseStrategy {
  readonly drift: number;
  readonly ratio: number;

  constructor(row: Pick<ArmedStrategy, "id" | "assetPairs" | "targetSpread" | "volatilityDriftThreshold" | "targetPortfolioRatio">) {
    super(row.id, "CORRELATION", row.assetPairs, row.targetSpread);
    this.drift = row.volatilityDriftThreshold ?? row.targetSpread;
    this.ratio = row.targetPortfolioRatio ?? 0.5;
  }

  evaluateCondition(market: MarketData, rwa: RWAData): boolean {
    if (!Number.isFinite(market.currentPrice) || !Number.isFinite(rwa.referencePrice)) return false;
    const diverge = market.currentPrice - rwa.referencePrice;
    this.spreadPct = diverge;
    this.side = diverge < 0 ? "buy" : "sell";
    this.rail = null;
    return Math.abs(diverge) >= this.drift;
  }
}
