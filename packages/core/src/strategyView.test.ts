import assert from "node:assert/strict";
import test from "node:test";
import { agenticAvailability, studioDeskStatus } from "./opportunityView";
import { marketHref } from "./portfolioView";
import { cashSession } from "./session";
import { STRATEGY_CATALOG, adviseDesk, deskSignals, jobFromStrategy } from "./strategies";
import { previewJob, strategyPresence, strategyRule, strategiesLayout, validateStrategyInput } from "./strategyView";
import type { RailBook } from "./types";

function book(symbol: string, rail: "bStock" | "ondo" | "xStock", perShare: number): RailBook {
  return {
    wrapper: { rail, type: 2, symbol, address: "0x1111111111111111111111111111111111111111", decimals: 18, multiplier: 1 },
    routes: [],
    status: "OPEN",
    badge: "SWAP",
    best: {
      wrapper: { rail, type: 2, symbol, address: "0x1111111111111111111111111111111111111111", decimals: 18, multiplier: 1 },
      ok: true,
      quoteExpiresAt: Date.now() + 10_000,
      inAmount: "10",
      outAmount: "1",
      mid: perShare,
      perShare,
      slipBps50: 10,
      slipBps500: 20,
      slipKnown: true,
      gasUsd: 0.01,
      raw: {},
    },
  };
}

test("catalog is the eight shipped strategies", () => {
  assert.deepEqual(
    STRATEGY_CATALOG.map((card) => card.id),
    ["dca", "index_core", "cheap_rail", "weekend_cap", "gap_fade", "open_print", "flatten_earnings", "session_hours"],
  );
  assert.equal(STRATEGY_CATALOG.every((card) => card.thesis && card.when && card.skip), true);
});

test("presence follows advice and the saved job, not the catalog entry", () => {
  const fire = { id: "cheap_rail" as const, name: "Cheap rail", status: "fire" as const, headline: "buy", reason: "spread", jobType: "cheap_rail" as const };
  assert.equal(strategyPresence(fire, null), "FIRE");
  assert.equal(strategyPresence({ ...fire, status: "wait" }, { paused: false }), "ARMED");
  assert.equal(strategyPresence({ ...fire, status: "wait" }, { paused: true }), "PAUSED");
  assert.equal(strategyPresence({ ...fire, status: "skip" }, null), "SKIP");
  assert.equal(strategyPresence({ ...fire, status: "info" }, null), "WATCH");
  assert.equal(strategyPresence(undefined, null), "READY");
});

test("cheap rail defaults come from jobFromStrategy", () => {
  const job = previewJob("cheap_rail", "NVDA");
  const spec = job?.spec as { minBps?: number; maxSlipBps?: number };
  assert.equal(spec.minBps, jobFromStrategy("cheap_rail", { ticker: "NVDA", usdt: "10" })?.spec && (jobFromStrategy("cheap_rail", { ticker: "NVDA", usdt: "10" })?.spec as { minBps: number }).minBps);
  assert.equal(strategyRule(job), "minimum spread 40 bps · slip cap 80 bps");
  assert.equal(previewJob("session_hours", "NVDA"), null);
});

test("validation blocks a bad size, a bad ticker, and the session router", () => {
  assert.equal(validateStrategyInput({ id: "dca", ticker: "NVDA", usdt: "0", orderCap: 25 }).ok, false);
  assert.equal(validateStrategyInput({ id: "dca", ticker: "NVDA", usdt: "40", orderCap: 25 }).ok, false);
  assert.equal(validateStrategyInput({ id: "dca", ticker: "bad ticker", usdt: "10", orderCap: 25 }).ok, false);
  assert.match(validateStrategyInput({ id: "session_hours", ticker: "NVDA", usdt: "10" }).ok ? "" : (validateStrategyInput({ id: "session_hours", ticker: "NVDA", usdt: "10" }) as { message: string }).message, /does not arm/);
  assert.equal(validateStrategyInput({ id: "dca", ticker: "NVDA", usdt: "10", orderCap: 25 }).ok, true);
});

test("advice and handoffs do not sign", () => {
  const signals = deskSignals({
    ticker: "NVDA",
    session: cashSession(),
    books: [book("NVDAx", "xStock", 100)],
    fridayClose: 100,
    fridayOpen: null,
    fridayDate: null,
    priorClose: 100,
    priorOpen: null,
    priorDate: "2026-10-01",
    sessionOpen: null,
    sessionOpenDate: null,
  });
  const advice = adviseDesk(signals, []);
  assert.ok(advice.length >= 1);
  assert.equal(advice.some((row) => JSON.stringify(row).toLowerCase().includes("signed transaction")), false);
  assert.equal(marketHref("NVDA"), "/markets/NVDA");
  assert.equal(agenticAvailability(null), "UNKNOWN");
  assert.equal(studioDeskStatus({ deskKnown: false, live: true }), "NOT CONNECTED TO DESK");
  assert.equal(strategiesLayout(899), "stack");
});
