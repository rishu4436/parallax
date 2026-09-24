import type { ArmedStrategy } from "../types";
import { BaseStrategy, type MarketData, type RWAData } from "./BaseStrategy";

/**
 * bStock versus Ondo. currentPrice is the bStock per-share print.
 * referencePrice is the Ondo per-share print. The clip buys the cheaper rail.
 */
export class CrossArb extends BaseStrategy {
  constructor(row: Pick<ArmedStrategy, "id" | "assetPairs" | "targetSpread">) {
    super(row.id, "CROSS_ARB", row.assetPairs, row.targetSpread);
  }

  evaluateCondition(market: MarketData, rwa: RWAData): boolean {
    if (!(market.currentPrice > 0) || !(rwa.referencePrice > 0)) return false;
    const gap = ((market.currentPrice - rwa.referencePrice) / rwa.referencePrice) * 100;
    this.spreadPct = gap;
    this.side = "buy";
    this.rail = gap <= 0 ? "bStock" : "ondo";
    return Math.abs(gap) >= this.targetSpread;
  }
}
