import type { AgentStrategyType, Rail, Side } from "../types";

export interface MarketData {
  currentPrice: number;
  volume: number;
}

export interface RWAData {
  referencePrice: number;
  isMarketOpen: boolean;
}

export interface TransactionPayload {
  to: string;
  data: string;
  value: string;
}

export interface IStrategy {
  id: string;
  type: "BASIS_TRADE" | "CROSS_ARB" | "CORRELATION";
  assetPairs: string[];
  targetSpread: number;
  evaluateCondition(marketData: MarketData, rwaData: RWAData): boolean;
  generateSwapPayload(): TransactionPayload;
}

const EMPTY: TransactionPayload = {
  to: "0x0000000000000000000000000000000000000000",
  data: "0x",
  value: "0",
};

export abstract class BaseStrategy implements IStrategy {
  readonly id: string;
  readonly type: AgentStrategyType;
  readonly assetPairs: string[];
  readonly targetSpread: number;
  spreadPct = 0;
  side: Side = "buy";
  rail: Rail | null = null;
  protected payload: TransactionPayload = EMPTY;

  constructor(id: string, type: AgentStrategyType, assetPairs: string[], targetSpread: number) {
    this.id = id;
    this.type = type;
    this.assetPairs = assetPairs;
    this.targetSpread = targetSpread;
  }

  abstract evaluateCondition(marketData: MarketData, rwaData: RWAData): boolean;

  generateSwapPayload(): TransactionPayload {
    return this.payload;
  }

  remember(tx: TransactionPayload): void {
    this.payload = tx;
  }
}
