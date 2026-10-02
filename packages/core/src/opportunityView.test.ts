import assert from "node:assert/strict";
import test from "node:test";
import { activityForTicker } from "./markets";
import { evaluatePolicy } from "./policy";
import {
  agenticAvailability,
  cardForRail,
  cardIsStale,
  needsAttention,
  opportunityQueue,
  proposalFromOpportunity,
  queryOpportunityQueue,
  scanPhase,
  studioDeskStatus,
  universeCounts,
} from "./opportunityView";
import type { OpportunityCard } from "./opportunity";
import { limitsFromSettings } from "./flag";
import type { Settings, VenueQuote, Wrapper } from "./types";
import { QUOTE_TTL_MS } from "./types";

function card(partial: Partial<OpportunityCard> & Pick<OpportunityCard, "ticker" | "rail" | "symbol">): OpportunityCard {
  return {
    name: partial.name || partial.ticker,
    perShare: 100,
    reference: 100,
    referenceLabel: "prior close",
    grossPct: 0,
    slipPct: 0,
    costPct: 0,
    feePct: 0,
    netPct: 0,
    complete: true,
    liquidity: 200_000,
    status: "OPEN",
    ...partial,
  };
}

const now = 50_000;
const settings: Settings = {
  orderCapUsdt: 25,
  dailyCapUsdt: 100,
  allowedRails: ["bStock", "ondo", "xStock"],
  killSwitch: false,
  minNetEdgePct: 0.5,
  maxSlipPct: 0.5,
  minLiquidityUsd: 100_000,
  approvalRequired: true,
};

function wrapper(): Wrapper {
  return {
    rail: "xStock",
    type: 2,
    symbol: "NVDAx",
    address: "0x1111111111111111111111111111111111111111",
    decimals: 18,
    multiplier: 1,
  };
}

function quote(expiresAt: number): VenueQuote {
  return {
    wrapper: wrapper(),
    ok: true,
    executionMode: "SWAP",
    quoteExpiresAt: expiresAt,
    inAmount: "1",
    outAmount: "1",
    mid: 102,
    perShare: 102,
    slipBps50: 10,
    slipBps500: 20,
    slipKnown: true,
    gasUsd: 0.02,
    networkFeeUsd: 0.02,
    gasEstimateUsd: null,
    priceImpactPct: null,
    tradeFeeUsd: null,
    userWalletAddress: "0xabcdef0000000000000000000000000000000001",
    raw: {},
  };
}

test("queue sorts by absolute net edge, then gross gap, then ticker", () => {
  const rows = opportunityQueue([
    card({ ticker: "AAPL", rail: "xStock", symbol: "AAPLx", netPct: 1, grossPct: 1.2 }),
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", netPct: -2, grossPct: -2.2 }),
    card({ ticker: "TSLA", rail: "xStock", symbol: "TSLAx", netPct: 2, grossPct: 1 }),
  ]);
  assert.deepEqual(
    queryOpportunityQueue(rows, { sort: "net" }).map((row) => row.ticker),
    ["NVDA", "TSLA", "AAPL"],
  );
  assert.deepEqual(
    queryOpportunityQueue(rows, { sort: "gap" }).map((row) => row.ticker),
    ["NVDA", "AAPL", "TSLA"],
  );
  assert.deepEqual(
    queryOpportunityQueue(rows, { sort: "alpha" }).map((row) => row.ticker),
    ["AAPL", "NVDA", "TSLA"],
  );
});

test("filters stay backed by quote status, session, and rails", () => {
  const rows = opportunityQueue([
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", status: "OPEN", perShare: 102, reference: 100, netPct: 1.5, grossPct: 2 }),
    card({ ticker: "NVDA", rail: "bStock", symbol: "NVDAB", status: "CLOSED", perShare: 101, reference: 100, errorText: "40367 US hours" }),
    card({ ticker: "AAPL", rail: "bStock", symbol: "AAPLB", status: "HALTED", perShare: 0, reference: 0, complete: false }),
    card({ ticker: "TSLA", rail: "ondo", symbol: "TSLAon", status: "OFFLINE", perShare: 0, reference: 0, errorText: "upstream" }),
  ]);
  assert.deepEqual(queryOpportunityQueue(rows, { lens: "open", now }).map((row) => row.ticker), ["NVDA"]);
  assert.deepEqual(queryOpportunityQueue(rows, { lens: "cash-closed", cashOpen: true, now }).map((row) => row.ticker), []);
  assert.deepEqual(queryOpportunityQueue(rows, { lens: "cash-closed", cashOpen: false, now }).map((row) => row.ticker), ["NVDA"]);
  assert.deepEqual(queryOpportunityQueue(rows, { lens: "cross-rail" }).map((row) => row.ticker), ["NVDA"]);
  assert.ok(queryOpportunityQueue(rows, { lens: "attention", now, limits: limitsFromSettings(settings, 10), sizeUsdt: 10 }).some((row) => row.ticker === "AAPL"));
  assert.deepEqual(queryOpportunityQueue(rows, { search: "NVDAB" }).map((row) => row.ticker), ["NVDA"]);
  const locked = queryOpportunityQueue(rows, { rail: "bStock", search: "NVDA" })[0];
  assert.equal(locked.card.symbol, "NVDAB");
  assert.equal(locked.card.status, "CLOSED");
});

test("missing prices and unknown slip do not become zero economics", () => {
  const bare = card({
    ticker: "NVDA",
    rail: "xStock",
    symbol: "NVDAx",
    perShare: 0,
    reference: 0,
    complete: false,
    networkFeeUsd: null,
    gasEstimateUsd: null,
    tradeFeeUsd: null,
    liquidity: 0,
  });
  assert.equal(bare.reference != null && bare.reference > 0, false);
  assert.equal(bare.networkFeeUsd, null);
  assert.equal(bare.gasEstimateUsd, null);
  assert.equal(bare.tradeFeeUsd, null);
  assert.equal(bare.complete, false);
  assert.equal(needsAttention(bare, limitsFromSettings(settings, 10), 10, now), true);
});

test("stale quotes and scan phases stay distinct", () => {
  const fresh = card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", quoteExpiresAt: now + 10_000 });
  const stale = card({ ticker: "AAPL", rail: "xStock", symbol: "AAPLx", quoteExpiresAt: now - 1 });
  assert.equal(cardIsStale(fresh, now), false);
  assert.equal(cardIsStale(stale, now), true);
  assert.deepEqual(
    queryOpportunityQueue(opportunityQueue([stale, fresh]), { lens: "open", now }).map((row) => row.ticker),
    ["NVDA"],
  );
  assert.equal(scanPhase({ scanning: true, cards: 0, scanAt: 0, now }), "SCANNING");
  assert.equal(scanPhase({ scanning: false, error: "down", cards: 0, scanAt: 0, now }), "OFFLINE");
  assert.equal(scanPhase({ scanning: false, error: "partial", cards: 2, scanAt: now, now }), "PARTIAL");
  assert.equal(scanPhase({ scanning: false, cards: 2, scanAt: now - QUOTE_TTL_MS - 1, now }), "STALE");
  assert.equal(scanPhase({ scanning: false, cards: 2, scanAt: now, now }), "LIVE");
});

test("rail lock does not fall back to another rail", () => {
  const cards = [
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", netPct: 3 }),
    card({ ticker: "NVDA", rail: "ondo", symbol: "NVDAon", status: "CLOSED", perShare: 0 }),
  ];
  assert.equal(cardForRail(cards, "NVDA", "ondo")?.symbol, "NVDAon");
  assert.equal(cardForRail(cards, "NVDA", "bStock"), null);
  assert.notEqual(cardForRail(cards, "NVDA", "ondo")?.symbol, "NVDAx");
});

test("policy preview is the existing PolicyEngine", () => {
  const row = card({
    ticker: "NVDA",
    rail: "xStock",
    symbol: "NVDAx",
    perShare: 102,
    reference: 100,
    grossPct: 2,
    netPct: 1.8,
    complete: true,
    quoteExpiresAt: now + QUOTE_TTL_MS,
  });
  const wallet = "0xabcdef0000000000000000000000000000000001" as const;
  const pass = evaluatePolicy(
    proposalFromOpportunity({ card: row, settings, spentToday: 0, now, wallet, usdt: "10", quote: quote(now + QUOTE_TTL_MS) }),
  );
  assert.equal(pass.verdict, "PASS");
  const blocked = evaluatePolicy(
    proposalFromOpportunity({
      card: row,
      settings: { ...settings, killSwitch: true },
      spentToday: 0,
      now,
      wallet,
      usdt: "10",
      quote: quote(now + QUOTE_TTL_MS),
    }),
  );
  assert.equal(blocked.verdict, "BLOCK");
  assert.equal(blocked.primary?.code, "KILL_SWITCH");
  const requote = evaluatePolicy(
    proposalFromOpportunity({ card: row, settings, spentToday: 0, now, wallet, usdt: "10", quote: quote(now - 1) }),
  );
  assert.equal(requote.verdict, "REQUOTE");
});

test("agentic wallet and studio status do not invent a connection", () => {
  assert.equal(agenticAvailability(null), "UNKNOWN");
  assert.equal(agenticAvailability("UNCONNECTED"), "DISCONNECTED");
  assert.equal(agenticAvailability("CONNECTED"), "CONNECTED");
  assert.equal(studioDeskStatus({ deskKnown: false, live: false }), "NOT CONNECTED TO DESK");
  assert.equal(studioDeskStatus({ deskKnown: true, live: false }), "OFFLINE");
  assert.equal(studioDeskStatus({ deskKnown: true, live: true }), "ONLINE");
});

test("universe counts and activity come from the supplied records", () => {
  const counts = universeCounts([
    { ticker: "NVDA", name: "NVIDIA", wrappers: [{ rail: "xStock", symbol: "NVDAx", multiplier: 1 }, { rail: "bStock", symbol: "NVDAB", multiplier: 1 }] },
    { ticker: "AAPL", name: "Apple", wrappers: [{ rail: "ondo", symbol: "AAPLon", multiplier: 1 }] },
  ]);
  assert.deepEqual(counts, { assets: 2, rails: 3 });
  const rows = activityForTicker(
    [
      { ticker: "NVDA", id: "p", passportHash: "abc" },
      { ticker: "AAPL", id: "q" },
    ],
    "NVDA",
  );
  assert.deepEqual(rows.map((row) => row.id), ["p"]);
});
