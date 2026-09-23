import assert from "node:assert/strict";
import test from "node:test";
import { decideJob, nextLastAt } from "./jobs";
import type { CashSession } from "./session";
import type { Job } from "./types";

const wallet = "0x0000000000000000000000000000000000000001" as const;
const open = { atmosphere: "open", kind: "regular" } as CashSession;
const closed = { atmosphere: "closed", kind: "post" } as CashSession;

function dca(): Job {
  return {
    id: "1",
    name: "DCA",
    type: "dca",
    paused: false,
    cadence: "hourly",
    cron: "0 * * * *",
    createdAt: 0,
    spec: { tickers: ["NVDA", "AAPL"], usdtEach: "10", cron: "0 * * * *", rail: "best" },
  };
}

test("a closed weekend cap waits for the cash open and does not consume the cadence", () => {
  const job: Job = {
    id: "w",
    name: "weekend",
    type: "weekend_cap",
    paused: false,
    cadence: "queue",
    cron: "30 9 * * 1-5",
    createdAt: 0,
    spec: { ticker: "NVDA", maxUsdt: "15", gapPct: 1, mode: "queue_for_cash_open" },
  };
  const decision = decideJob(job, {
    now: new Date("2026-09-22T22:00:00Z"),
    session: closed,
    gapPct: 3,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(decision.intents.length, 0);
  assert.equal(decision.action, "waiting for cash open");
  assert.equal(decision.retryMs, 120_000);
  const stamped = nextLastAt(1_000_000, job.cron, decision.retryMs);
  assert.ok(stamped < 1_000_000);
});

test("DCA queues only the ticker being evaluated, on an open rail", () => {
  const decision = decideJob(dca(), {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: 1,
    railOpen: true,
    wallet,
    ticker: "AAPL",
  });
  assert.equal(decision.intents.length, 1);
  assert.equal(decision.intents[0]?.ticker, "AAPL");
  assert.equal(decision.intents[0]?.side, "buy");
  assert.equal(decision.retryMs, null);
});

test("flatten does nothing a week before the print", () => {
  const job: Job = {
    id: "f",
    name: "flatten",
    type: "flatten_earnings",
    paused: false,
    cadence: "around the print",
    cron: "0 * * * *",
    createdAt: 0,
    spec: {
      ticker: "NVDA",
      cutPctBeforePrint: 25,
      dipPct: 3,
      usdtAdd: "10",
      flattenAfterHours: true,
      printAt: "2026-09-30T16:00:00",
    },
  };
  const decision = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: 0,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(decision.intents.length, 0);
  assert.match(decision.action, /24h window/);
});

test("DCA skips a clip that is already rich versus Friday", () => {
  const job = dca();
  (job.spec as { maxPremiumPct?: number }).maxPremiumPct = 2;
  const decision = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: 3.2,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(decision.intents.length, 0);
  assert.match(decision.action, /premium cap/);
});

test("cheap rail locks the cheaper open wrapper when the spread clears the floor", () => {
  const job: Job = {
    id: "c",
    name: "cheap",
    type: "cheap_rail",
    paused: false,
    cadence: "every 15m",
    cron: "*/15 * * * *",
    createdAt: 0,
    spec: { tickers: ["NVDA"], usdtEach: "10", minBps: 40, maxSlipBps: 80 },
  };
  const decision = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: 0,
    railOpen: true,
    wallet,
    ticker: "NVDA",
    rails: [
      { rail: "bStock", symbol: "NVDAB", open: true, perShare: 222, slipBps50: 4, slipBps500: 12, slipKnown: true, status: "OPEN" },
      { rail: "ondo", symbol: "NVDAon", open: true, perShare: 221, slipBps50: 3, slipBps500: 10, slipKnown: true, status: "OPEN" },
      { rail: "xStock", symbol: "NVDAx", open: false, perShare: null, slipBps50: 0, slipBps500: 0, slipKnown: false, status: "CLOSED" },
    ],
  });
  assert.equal(decision.intents[0]?.railLock, "ondo");
  assert.equal(decision.intents[0]?.side, "buy");
  assert.match(decision.action, /NVDAon/);
});

test("cheap rail waits when only one rail is open", () => {
  const job: Job = {
    id: "c",
    name: "cheap",
    type: "cheap_rail",
    paused: false,
    cadence: "every 15m",
    cron: "*/15 * * * *",
    createdAt: 0,
    spec: { tickers: ["NVDA"], usdtEach: "10", minBps: 40 },
  };
  const decision = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: 0,
    railOpen: true,
    wallet,
    ticker: "NVDA",
    rails: [
      { rail: "xStock", symbol: "NVDAx", open: true, perShare: 220, slipBps50: 20, slipBps500: 80, slipKnown: true, status: "OPEN" },
    ],
  });
  assert.equal(decision.intents.length, 0);
  assert.match(decision.action, /two open rails/);
});

test("prior-close discount ignores a stale Friday gap", () => {
  const job: Job = {
    id: "g",
    name: "discount",
    type: "gap_fade",
    paused: false,
    cadence: "trade_if_open",
    cron: "*/15 * * * *",
    createdAt: 0,
    spec: { ticker: "NVDA", usdtEach: "10", discountPct: 1, mode: "trade_if_open" },
  };
  const ctx = {
    now: new Date("2026-09-23T15:00:00Z"),
    session: open,
    gapPct: -2.4,
    gapVsFriday: -2.4,
    gapVsPriorClose: 0.4,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  };
  const miss = decideJob(job, ctx);
  assert.equal(miss.intents.length, 0);
  const hit = decideJob(job, { ...ctx, gapVsPriorClose: -1.5 });
  assert.equal(hit.intents[0]?.side, "buy");
  assert.match(hit.action, /prior close/);
});

test("Friday discount queues a buy only when the wrapper is cheap versus Friday", () => {
  const job: Job = {
    id: "g",
    name: "discount",
    type: "gap_fade",
    paused: false,
    cadence: "trade_if_open",
    cron: "*/15 * * * *",
    createdAt: 0,
    spec: { ticker: "NVDA", usdtEach: "10", discountPct: 1, mode: "trade_if_open" },
  };
  const miss = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: -0.4,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(miss.intents.length, 0);
  const hit = decideJob(job, {
    now: new Date("2026-09-22T15:00:00Z"),
    session: open,
    gapPct: -1.4,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(hit.intents[0]?.side, "buy");
  assert.match(hit.action, /discount/);
});

test("cash-open window buys a leftover discount and will not fire twice the same day", () => {
  const job: Job = {
    id: "o",
    name: "open",
    type: "open_print",
    paused: false,
    cadence: "weekdays 09:30 ET",
    cron: "30 9 * * 1-5",
    createdAt: 0,
    spec: { ticker: "NVDA", usdtEach: "10", minGapPct: 0.5, windowMin: 30 },
  };
  const session = {
    atmosphere: "open",
    kind: "regular",
    et: { hour: 9, minute: 42, weekday: 3, ymd: "2026-09-23", year: 2026, month: 9, day: 23, second: 0 },
  } as CashSession;
  const first = decideJob(job, {
    now: new Date("2026-09-23T13:42:00Z"),
    session,
    gapPct: -0.9,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(first.intents[0]?.side, "buy");
  assert.match(first.action, /print sent · 2026-09-23/);
  const second = decideJob(job, {
    now: new Date("2026-09-23T13:50:00Z"),
    session,
    gapPct: -0.9,
    railOpen: true,
    wallet,
    ticker: "NVDA",
    lastAction: first.action,
  });
  assert.equal(second.intents.length, 0);
});

test("flatten sells once inside the day before the print, then will not cut again", () => {
  const job: Job = {
    id: "f",
    name: "flatten",
    type: "flatten_earnings",
    paused: false,
    cadence: "around the print",
    cron: "0 * * * *",
    createdAt: 0,
    spec: {
      ticker: "NVDA",
      cutPctBeforePrint: 25,
      dipPct: 3,
      usdtAdd: "10",
      flattenAfterHours: true,
      printAt: "2026-09-23T16:00:00Z",
    },
  };
  const first = decideJob(job, {
    now: new Date("2026-09-23T12:00:00Z"),
    session: open,
    gapPct: 0,
    railOpen: true,
    wallet,
    ticker: "NVDA",
  });
  assert.equal(first.intents[0]?.side, "sell");
  assert.match(first.action, /cut sent/);
  const second = decideJob(job, {
    now: new Date("2026-09-23T13:00:00Z"),
    session: open,
    gapPct: 0,
    railOpen: true,
    wallet,
    ticker: "NVDA",
    lastAction: first.action,
  });
  assert.equal(second.intents.length, 0);
});
