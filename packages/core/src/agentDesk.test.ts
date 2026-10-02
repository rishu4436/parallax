import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_CAN, AGENT_CANNOT, MCP_TOOLS, agentReceipts, agentsLayout, describeFill, partitionActivity, strategyRows, workerPhase } from "./agentDesk";
import { agenticAvailability, studioDeskStatus } from "./opportunityView";
import type { AgentFill, ArmedStrategy, Job } from "./types";

function fill(partial: Partial<AgentFill> = {}): AgentFill {
  return {
    id: "f1",
    at: 1_000,
    strategyId: "s1",
    strategyType: "BASIS_TRADE",
    ticker: "NVDA",
    side: "buy",
    usdt: "1",
    spreadPct: 1.2,
    gasUsd: null,
    x402: "funded",
    x402Detail: "ok",
    status: "filled",
    note: "sent",
    passportHash: "abc123",
    receiptId: "r1",
    txHash: "0xabc",
    ...partial,
  };
}

test("agentic wallet and studio states stay honest", () => {
  assert.equal(agenticAvailability("CONNECTED"), "CONNECTED");
  assert.equal(agenticAvailability("UNCONNECTED"), "DISCONNECTED");
  assert.equal(agenticAvailability(null), "UNKNOWN");
  assert.equal(studioDeskStatus({ deskKnown: false, live: true }), "NOT CONNECTED TO DESK");
  assert.equal(studioDeskStatus({ deskKnown: true, live: false }), "OFFLINE");
  assert.equal(studioDeskStatus({ deskKnown: true, live: true }), "ONLINE");
});

test("worker phase follows the beat and armed rows", () => {
  assert.equal(workerPhase({ beat: null, armedUnpaused: 0 }), "UNKNOWN");
  assert.equal(workerPhase({ beat: "stopped", armedUnpaused: 2 }), "STOPPED");
  assert.equal(workerPhase({ beat: "live", armedUnpaused: 0 }), "RUNNING");
  assert.equal(workerPhase({ beat: "live", armedUnpaused: 1 }), "ARMED");
});

test("mcp tools analyze and prepare but never sign", () => {
  assert.ok(MCP_TOOLS.some((tool) => tool.name === "parallax_passport"));
  assert.ok(MCP_TOOLS.every((tool) => tool.signs === false));
  assert.ok(MCP_TOOLS.every((tool) => tool.access === "READ" || tool.access === "ANALYZE" || tool.access === "PREPARE"));
});

test("fills become activity and receipts without inventing a scan timeline", () => {
  const row = describeFill(fill());
  assert.equal(row.demo, false);
  assert.equal(row.passportHash, "abc123");
  assert.match(row.title, /NVDA/);
  const receipts = agentReceipts([fill(), fill({ id: "f2", status: "skipped", receiptId: undefined, txHash: undefined, passportHash: undefined })], []);
  assert.equal(receipts[0].status, "FILLED");
  assert.equal(receipts[1].status, "SKIPPED");
  assert.equal(receipts[1].txOrOrder, undefined);
  const split = partitionActivity([
    { id: "live", demo: false },
    { id: "demo", demo: true },
  ]);
  assert.deepEqual(split.live.map((item) => item.id), ["live"]);
  assert.deepEqual(split.demo.map((item) => item.id), ["demo"]);
});

test("strategy rows keep armed and paused states", () => {
  const armed: ArmedStrategy = {
    id: "a",
    type: "BASIS_TRADE",
    name: "Basis Trade",
    assetPairs: ["NVDA"],
    targetSpread: 1.5,
    usdt: "1",
    paused: false,
    createdAt: 1,
    lastAction: "quoted",
    lastAt: 2,
  };
  const job: Job = {
    id: "j",
    name: "Session DCA",
    type: "dca",
    paused: true,
    cadence: "weekdays",
    cron: "0 10 * * 1-5",
    createdAt: 1,
    spec: { tickers: ["QQQ"], usdtEach: "10", cron: "0 10 * * 1-5", rail: "best" },
  };
  const rows = strategyRows([armed], [job]);
  assert.equal(rows[0].state, "armed");
  assert.equal(rows[0].ticker, "NVDA");
  assert.equal(rows[1].state, "paused");
  assert.equal(rows[1].size, "10 USDT");
});

test("the agent boundary names passport and forbids unsigned bypass", () => {
  assert.match(AGENT_CAN.join(" "), /Agentic Wallet/);
  assert.match(AGENT_CANNOT.join(" "), /Execution Passport/);
  assert.match(AGENT_CANNOT.join(" "), /kill switch/i);
  assert.equal(agentsLayout(899), "stack");
  assert.equal(agentsLayout(900), "workspace");
});
