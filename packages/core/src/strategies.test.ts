import assert from "node:assert/strict";
import test from "node:test";
import { bookFromRoutes } from "./router";
import { adviseDesk, deskSignals, jobFromStrategy } from "./strategies";
import type { CashSession } from "./session";
import type { VenueQuote, Wrapper } from "./types";

function wrapper(rail: Wrapper["rail"], symbol: string, multiplier = 1): Wrapper {
  return {
    rail,
    type: rail === "ondo" ? 1 : rail === "xStock" ? 2 : 3,
    symbol,
    address: "0x0000000000000000000000000000000000000001",
    decimals: 18,
    multiplier,
  };
}

function quote(partial: Partial<VenueQuote> & Pick<VenueQuote, "wrapper" | "outAmount" | "ok" | "perShare">): VenueQuote {
  return {
    executionMode: "RFQ",
    vendorName: "PcsXRfq",
    quoteId: "q",
    quoteExpiresAt: 1_000 + 30_000,
    inAmount: "10000000000000000000",
    mid: partial.perShare,
    slipBps50: 8,
    slipBps500: 20,
    slipKnown: true,
    gasUsd: 0.02,
    raw: {},
    ...partial,
  };
}

const open = {
  atmosphere: "open",
  kind: "regular",
  et: { hour: 10, minute: 0, weekday: 3, ymd: "2026-09-23", year: 2026, month: 9, day: 23, second: 0 },
  countdownMs: 6 * 3600_000,
} as CashSession;

test("desk signals use multiplier-adjusted per-share and measure the cross-rail spread", () => {
  const ondo = wrapper("ondo", "NVDAon", 1.0017);
  const b = wrapper("bStock", "NVDAB", 1);
  const books = [
    bookFromRoutes([quote({ wrapper: ondo, ok: true, outAmount: "1", perShare: 221 })]),
    bookFromRoutes([quote({ wrapper: b, ok: true, outAmount: "1", perShare: 222.2 })]),
  ];
  const signals = deskSignals({
    ticker: "NVDA",
    session: open,
    books,
    fridayClose: 222.27,
    now: new Date("2026-09-23T14:00:00Z"),
  });
  assert.equal(signals.cheapest?.rail, "ondo");
  assert.ok(signals.crossRailBps != null && signals.crossRailBps > 50);
  assert.ok(signals.gapPct != null && signals.gapPct < 0);
});

test("adviseDesk fires cheap rail when two wrappers are open and wide, and keeps session router as info", () => {
  const ondo = wrapper("ondo", "NVDAon");
  const b = wrapper("bStock", "NVDAB");
  const books = [
    bookFromRoutes([quote({ wrapper: ondo, ok: true, outAmount: "1", perShare: 220 })]),
    bookFromRoutes([quote({ wrapper: b, ok: true, outAmount: "1", perShare: 222 })]),
  ];
  const advice = adviseDesk(
    deskSignals({
      ticker: "NVDA",
      session: open,
      books,
      fridayClose: 222.27,
      now: new Date("2026-09-23T14:00:00Z"),
    }),
  );
  const cheap = advice.find((row) => row.id === "cheap_rail");
  const hours = advice.find((row) => row.id === "session_hours");
  const index = advice.find((row) => row.id === "index_core");
  assert.equal(cheap?.status, "fire");
  assert.equal(cheap?.headline.includes("ondo"), true);
  assert.equal(hours?.status, "info");
  assert.equal(index?.status, "info");
});

test("session router names the rails that are actually open while cash is dark", () => {
  const ondo = wrapper("ondo", "NVDAon");
  const b = wrapper("bStock", "NVDAB");
  const books = [
    bookFromRoutes([quote({ wrapper: ondo, ok: true, outAmount: "1", perShare: 227 })]),
    bookFromRoutes([quote({ wrapper: b, ok: true, outAmount: "1", perShare: 227.2 })]),
  ];
  const closed = {
    atmosphere: "closed",
    kind: "pre",
    et: { hour: 8, minute: 0, weekday: 3, ymd: "2026-09-23", year: 2026, month: 9, day: 23, second: 0 },
    countdownMs: 90 * 60_000,
  } as CashSession;
  const hours = adviseDesk(
    deskSignals({
      ticker: "NVDA",
      session: closed,
      books,
      fridayClose: 222.27,
      now: new Date("2026-09-23T12:00:00Z"),
    }),
  ).find((row) => row.id === "session_hours");
  assert.equal(hours?.status, "info");
  assert.match(hours?.headline || "", /NVDAB|NVDAon/);
  assert.doesNotMatch(hours?.headline || "", /every rail blank/);
});

test("jobFromStrategy builds an index core DCA on QQQ and SPY", () => {
  const job = jobFromStrategy("index_core", { ticker: "NVDA", usdt: "10", id: "core" });
  assert.ok(job);
  assert.equal(job.type, "dca");
  assert.deepEqual((job.spec as { tickers: string[] }).tickers, ["QQQ", "SPY"]);
});
