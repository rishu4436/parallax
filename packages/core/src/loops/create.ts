import type { ArmedStrategy } from "../types";
import { BasisTrade } from "./BasisTrade";
import { Correlation } from "./Correlation";
import { CrossArb } from "./CrossArb";

export type DeskStrategy = BasisTrade | CrossArb | Correlation;

export function createStrategy(row: ArmedStrategy): DeskStrategy {
  if (row.type === "CROSS_ARB") return new CrossArb(row);
  if (row.type === "CORRELATION") return new Correlation(row);
  return new BasisTrade(row);
}
