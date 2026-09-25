import assert from "node:assert/strict";
import test from "node:test";
import { bestExecutable, edgeBreakdown, rankOpportunities, type OpportunityCard } from "./opportunity";

test("net edge subtracts slip, gas, and fee from the gross gap", () => {
  const edge = edgeBreakdown({
    perShare: 181.17,
    reference: 178.42,
    slipBps: 18,
    slipKnown: true,
    gasUsd: 0.09,
    notionalUsd: 100,
    feePct: 0.09,
  });
  assert.ok(edge);
  assert.ok(Math.abs(edge.grossPct - ((181.17 - 178.42) / 178.42) * 100) < 1e-9);
  assert.equal(edge.slipPct, 0.18);
  assert.ok(Math.abs(edge.costPct - 0.09) < 1e-9);
  assert.equal(edge.feePct, 0.09);
  assert.ok(Math.abs(edge.netPct - (edge.grossPct - 0.18 - 0.09 - 0.09)) < 1e-9);
  assert.equal(edge.complete, true);
});

test("unknown slip does not invent a haircut", () => {
  const edge = edgeBreakdown({
    perShare: 180,
    reference: 178,
    slipBps: 40,
    slipKnown: false,
    gasUsd: 0,
    notionalUsd: 10,
  });
  assert.ok(edge);
  assert.equal(edge.slipPct, 0);
  assert.equal(edge.complete, false);
  assert.ok(Math.abs(edge.netPct - edge.grossPct) < 1e-9);
});

test("rank prefers OPEN rails then absolute net edge then liquidity", () => {
  const card = (partial: Partial<OpportunityCard> & Pick<OpportunityCard, "symbol" | "netPct" | "status" | "liquidity">): OpportunityCard => ({
    ticker: "NVDA",
    name: "NVIDIA",
    rail: "bStock",
    perShare: 180,
    reference: 178,
    referenceLabel: "prior",
    grossPct: 1,
    slipPct: 0,
    costPct: 0,
    feePct: 0,
    complete: true,
    ...partial,
  });
  const ranked = rankOpportunities([
    card({ symbol: "NVDAx", netPct: 1.54, status: "HALTED", liquidity: 900 }),
    card({ symbol: "NVDAon", netPct: 0.35, status: "OPEN", liquidity: 100, rail: "ondo" }),
    card({ symbol: "NVDAB", netPct: -1.27, status: "OPEN", liquidity: 400, rail: "bStock" }),
  ]);
  assert.equal(ranked[0].symbol, "NVDAB");
  assert.equal(ranked[1].symbol, "NVDAon");
  assert.equal(bestExecutable(ranked)?.symbol, "NVDAB");
});
