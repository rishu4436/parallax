import type { ArmedStrategy } from "../types";
import { BaseStrategy, type MarketData, type RWAData } from "./BaseStrategy";

/** Weekend basis: cash is closed and the onchain print has drifted from the frozen reference. */
export class BasisTrade extends BaseStrategy {
  constructor(row: Pick<ArmedStrategy, "id" | "assetPairs" | "targetSpread">) {
    super(row.id, "BASIS_TRADE", row.assetPairs, row.targetSpread);
  }

  evaluateCondition(market: MarketData, rwa: RWAData): boolean {
    if (rwa.isMarketOpen) return false;
    if (!(market.currentPrice > 0) || !(rwa.referencePrice > 0)) return false;
    const gap = ((market.currentPrice - rwa.referencePrice) / rwa.referencePrice) * 100;
    this.spreadPct = gap;
    this.side = gap < 0 ? "buy" : "sell";
    this.rail = "bStock";
    return Math.abs(gap) >= this.targetSpread;
  }
}
