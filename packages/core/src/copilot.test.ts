import assert from "node:assert/strict";
import test from "node:test";
import { answerCopilot, parseCopilot } from "./copilot";
import type { OpportunityCard } from "./opportunity";

const nvdaB: OpportunityCard = {
  ticker: "NVDA",
  name: "NVIDIA",
  rail: "bStock",
  symbol: "NVDAB",
  perShare: 180.21,
  reference: 178.42,
  referenceLabel: "prior close",
  grossPct: 1.0,
  slipPct: 0.18,
  costPct: 0.09,
  feePct: 0,
  netPct: 0.73,
  complete: true,
  liquidity: 400_000,
  status: "OPEN",
};

const nvdaX: OpportunityCard = {
  ...nvdaB,
  rail: "xStock",
  symbol: "NVDAx",
  perShare: 181.17,
  grossPct: 1.54,
  netPct: 1.27,
  liquidity: 80_000,
  status: "OPEN",
};

test("copilot parses gap, net, compare, buy, simulate", () => {
  assert.deepEqual(parseCopilot("Find tokenized stocks trading more than 1% away from their reference price."), { type: "gap", minAbsPct: 1 });
  assert.deepEqual(parseCopilot("Find opportunities with at least 0.75% net edge."), { type: "net", minAbsPct: 0.75 });
  assert.equal(parseCopilot("Compare NVDA wrappers.").type, "compare");
  assert.equal(parseCopilot("Simulate this trade.").type, "simulate");
  const buy = parseCopilot("Buy $500 of the highest-liquidity NVDA opportunity.");
  assert.equal(buy.type, "buy");
  if (buy.type === "buy") {
    assert.equal(buy.usdt, "500");
    assert.equal(buy.ticker, "NVDA");
    assert.equal(buy.prefer, "liquidity");
  }
});

test("buy prefers liquidity when asked, otherwise net edge", () => {
  const liquid = answerCopilot({ type: "buy", usdt: "500", ticker: "NVDA", prefer: "liquidity" }, [nvdaX, nvdaB]);
  assert.equal(liquid.cards[0].symbol, "NVDAB");
  assert.equal(liquid.action?.usdt, "500");
  const net = answerCopilot({ type: "buy", usdt: "10", ticker: "NVDA", prefer: "net" }, [nvdaX, nvdaB]);
  assert.equal(net.cards[0].symbol, "NVDAx");
});

test("gap filter uses live cards only", () => {
  const reply = answerCopilot({ type: "gap", minAbsPct: 1.2 }, [nvdaB, nvdaX]);
  assert.equal(reply.cards.length, 1);
  assert.equal(reply.cards[0].symbol, "NVDAx");
});
