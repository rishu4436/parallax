import assert from "node:assert/strict";
import test from "node:test";
import { activityCounts, activityEvents, activityLayout, commitmentFacts, queryActivity, replaySteps } from "./activityView";
import { commitAgenticSwap, commitEvmTx } from "./commitment";
import { issueReceipt } from "./receipt";
import type { AgentFill, TapeRow } from "./types";

const NOW = Date.UTC(2026, 9, 2, 16, 0, 0);

function tape(partial: Partial<TapeRow> & Pick<TapeRow, "id" | "ticker" | "symbol">): TapeRow {
  return {
    at: NOW,
    side: "buy",
    rail: "xStock",
    usd: "10",
    status: "submitted",
    source: "user",
    ...partial,
  };
}

test("events sort newest first and keep recorded status", () => {
  const events = activityEvents({
    tape: [tape({ id: "old", ticker: "AAPL", symbol: "AAPLx", at: NOW - 10_000, status: "filled" }), tape({ id: "new", ticker: "NVDA", symbol: "NVDAx", at: NOW, status: "submitted" })],
  });
  assert.deepEqual(events.map((row) => row.id), ["new", "old"]);
  assert.equal(events[0].status, "SUBMITTED");
  assert.notEqual(events[1].status, "FILLED".toLowerCase());
  assert.equal(events[1].status, "FILLED");
});

test("search and filters use stored identifiers only", () => {
  const events = activityEvents({
    tape: [
      tape({ id: "u", ticker: "NVDA", symbol: "NVDAx", source: "user", passportHash: "aaa111", txHash: "0xabc", rail: "xStock" }),
      tape({ id: "g", ticker: "AAPL", symbol: "AAPLB", source: "agent", rail: "bStock", status: "failed" }),
    ],
    receipts: [
      issueReceipt({ id: "r1", passportHash: "bbb222", signingCommitmentHash: "ccc333", status: "filled", source: "strategy", submittedAt: NOW, txHash: "0xdef", orderId: "ord-9" }),
    ],
  });
  assert.deepEqual(queryActivity(events, { search: "nvda" }).map((row) => row.ticker), ["NVDA"]);
  assert.deepEqual(queryActivity(events, { search: "aaplb" }).map((row) => row.symbol), ["AAPLB"]);
  assert.equal(queryActivity(events, { search: "aaa1" })[0]?.passportHash, "aaa111");
  assert.equal(queryActivity(events, { search: "0xdef" })[0]?.source, "STRATEGY");
  assert.equal(queryActivity(events, { search: "ord-9" })[0]?.orderId, "ord-9");
  assert.deepEqual(queryActivity(events, { status: "FAILED" }).map((row) => row.ticker), ["AAPL"]);
  assert.deepEqual(queryActivity(events, { lens: "user" }).map((row) => row.ticker), ["NVDA"]);
  assert.deepEqual(queryActivity(events, { lens: "agent" }).map((row) => row.ticker), ["AAPL"]);
  assert.deepEqual(queryActivity(events, { lens: "strategy" }).map((row) => row.source), ["STRATEGY"]);
  assert.deepEqual(queryActivity(events, { rail: "bStock" }).map((row) => row.symbol), ["AAPLB"]);
  assert.equal(queryActivity(events, { window: "today", now: NOW + 1000 }).length, 3);
  assert.equal(queryActivity([], { lens: "all" }).length, 0);
});

test("commitment display does not invent a match or a timestamp", () => {
  const commitment = commitEvmTx({
    passportHash: "p".repeat(64),
    from: "0xabcdef0000000000000000000000000000000001",
    to: "0x1111111111111111111111111111111111111111",
    value: "0",
    data: "0xdeadbeef01",
    nonce: "7",
    gasLimit: "21000",
  });
  const matched = commitmentFacts(commitment, "p".repeat(64));
  assert.equal(matched.pair, "MATCHED");
  assert.equal(matched.evm?.selector, "0xdeadbeef");
  assert.equal(matched.evm?.nonce, "7");
  assert.equal(JSON.stringify(matched).includes("0xdeadbeef01"), false);
  assert.equal(commitmentFacts(commitment, "q".repeat(64)).pair, "MISMATCH");
  assert.equal(commitmentFacts(null).pair, "MISSING");
  const steps = replaySteps({ commitment, receipt: null, passport: null });
  assert.deepEqual(steps, [{ label: "SIGNING COMMITMENT", at: null }]);
});

test("agentic commitment and receipt stay on one event", () => {
  const passportHash = "a".repeat(64);
  const commitment = commitAgenticSwap({ passportHash, side: "buy", token: "0x1111111111111111111111111111111111111111", usdt: "10" });
  const receipt = issueReceipt({
    id: "ord-1",
    passportHash,
    signingCommitmentHash: commitment.hash,
    status: "submitted",
    source: "agentic",
    submittedAt: NOW,
    orderId: "ord-1",
    realizedSlippageBps: null,
  });
  const fill: AgentFill = {
    id: "f",
    at: NOW,
    strategyId: "s",
    strategyType: "BASIS_TRADE",
    ticker: "NVDA",
    side: "buy",
    usdt: "10",
    spreadPct: null,
    gasUsd: null,
    x402: "funded",
    x402Detail: "ok",
    status: "filled",
    note: "sent",
    passportHash,
    receiptId: "ord-1",
  };
  const [event] = activityEvents({ receipts: [receipt], fills: [fill] });
  assert.equal(event.source, "AGENT");
  assert.equal(event.status, "SUBMITTED");
  assert.equal(event.ticker, "NVDA");
  const facts = commitmentFacts(commitment, passportHash);
  assert.equal(facts.scheme, "AGENTIC_MARKET");
  assert.equal(facts.agentic?.fromQty, "10");
  assert.equal(receipt.realizedSlippageBps, null);
  const counts = activityCounts([event]);
  assert.equal(counts.receipts, 1);
  assert.equal(counts.agentActions, 1);
  assert.equal(activityLayout(899), "stack");
});
