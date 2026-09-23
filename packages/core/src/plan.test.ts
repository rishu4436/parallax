import assert from "node:assert/strict";
import test from "node:test";
import { strategyPlan } from "./plan";
import { bookFromRoutes } from "./router";
import type { CashSession } from "./session";
import { deskSignals, jobFromStrategy } from "./strategies";
import type { VenueQuote, Wrapper } from "./types";

function wrapper(rail: Wrapper["rail"], symbol: string): Wrapper {
  return {
    rail,
    type: rail === "ondo" ? 1 : 3,
    symbol,
    address: "0x0000000000000000000000000000000000000001",
    decimals: 18,
    multiplier: 1,
  };
}

function quote(partial: Partial<VenueQuote> & Pick<VenueQuote, "wrapper" | "outAmount" | "ok" | "perShare">): VenueQuote {
  return {
    executionMode: "RFQ",
    vendorName: "PcsXRfq",
    quoteId: "q",
    quoteExpiresAt: 30_000,
    inAmount: "10000000000000000000",
    mid: partial.perShare,
    slipBps50: 4,
    slipBps500: 10,
    slipKnown: true,
    gasUsd: 0.02,
    raw: {},
    ...partial,
  };
}

const session = {
  atmosphere: "open",
  kind: "regular",
  et: { hour: 10, minute: 0, weekday: 3, ymd: "2026-09-23", year: 2026, month: 9, day: 23, second: 0 },
} as CashSession;

test("an armed cheap-rail job shows a ready step, and a size above the cap is blocked", () => {
  const signals = deskSignals({
    ticker: "NVDA",
    session,
    books: [
      bookFromRoutes([quote({ wrapper: wrapper("ondo", "NVDAon"), ok: true, outAmount: "1", perShare: 220 })]),
      bookFromRoutes([quote({ wrapper: wrapper("bStock", "NVDAB"), ok: true, outAmount: "1", perShare: 222 })]),
    ],
    fridayClose: 221,
    priorClose: 221,
    now: new Date("2026-09-23T14:00:00Z"),
  });
  const cheap = jobFromStrategy("cheap_rail", { ticker: "NVDA", usdt: "10", id: "c" });
  assert.ok(cheap);
  const ready = strategyPlan({ signals, jobs: [cheap], orderCapUsdt: 25, dailyCapUsdt: 100 });
  assert.match(ready.headline, /ready to queue/);
  assert.equal(ready.steps.some((step) => step.state === "now" && step.title.includes("Cheap rail")), true);
  const blocked = strategyPlan({ signals, jobs: [cheap], orderCapUsdt: 1, dailyCapUsdt: 100 });
  assert.equal(blocked.steps.some((step) => step.state === "blocked" && /order cap/.test(step.detail)), true);
});

test("a name with no armed job says nothing will run", () => {
  const signals = deskSignals({
    ticker: "AAPL",
    session,
    books: [bookFromRoutes([quote({ wrapper: wrapper("ondo", "AAPLon"), ok: true, outAmount: "1", perShare: 200 })])],
    fridayClose: 200,
    priorClose: 200,
  });
  const plan = strategyPlan({ signals, jobs: [] });
  assert.match(plan.headline, /no job armed/);
  assert.equal(plan.steps.some((step) => step.title === "No job is armed"), true);
});
