import assert from "node:assert/strict";
import test from "node:test";
import {
  barsFromStooqCsv,
  cashGaps,
  cashPrintsFromBars,
  cashPrintsFromRwaMarket,
  lastCompletedBusinessYmd,
  lastFridayYmd,
  mergePrints,
  shortYmd,
} from "./friday";

function unix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

test("Wednesday clock uses Tuesday as prior session and keeps Friday separate", () => {
  const bars = [
    { t: unix("2026-09-18T13:30:00Z"), open: 220, close: 222.27 },
    { t: unix("2026-09-21T13:30:00Z"), open: 222, close: 223 },
    { t: unix("2026-09-22T13:30:00Z"), open: 223.5, close: 225 },
    { t: unix("2026-09-23T13:30:00Z"), open: 226, close: 0 },
  ];
  const now = new Date("2026-09-23T18:00:00Z");
  const prints = cashPrintsFromBars("NVDA", bars, now);
  assert.equal(prints.prior?.sessionDate, "2026-09-22");
  assert.equal(prints.prior?.close, 225);
  assert.equal(prints.prior?.open, 223.5);
  assert.equal(prints.friday?.sessionDate, "2026-09-18");
  assert.equal(prints.friday?.close, 222.27);
  assert.equal(prints.today?.sessionDate, "2026-09-23");
  assert.equal(prints.today?.open, 226);
  assert.equal(prints.today?.close, null);
  const gaps = cashGaps(227.5, prints);
  assert.ok(gaps.vsPriorClose != null && Math.abs(gaps.vsPriorClose - ((227.5 - 225) / 225) * 100) < 1e-9);
  assert.ok(gaps.vsPriorOpen != null && Math.abs(gaps.vsPriorOpen - ((227.5 - 223.5) / 223.5) * 100) < 1e-9);
  assert.ok(gaps.vsSessionOpen != null && Math.abs(gaps.vsSessionOpen - ((227.5 - 226) / 226) * 100) < 1e-9);
  assert.ok(gaps.vsFriday != null && gaps.vsFriday > gaps.vsPriorClose!);
});

test("stooq daily csv hydrates Friday 16:00 ET and the prior session", () => {
  const csv = [
    "Date,Open,High,Low,Close,Volume",
    "2026-09-18,220,223,219,222.27,100",
    "2026-09-21,222,224,221,223,100",
    "2026-09-22,223.5,226,223,225,100",
  ].join("\n");
  const prints = cashPrintsFromBars("NVDA", barsFromStooqCsv(csv), new Date("2026-09-23T18:00:00Z"), "stooq-daily");
  assert.equal(prints.source, "stooq-daily");
  assert.equal(prints.friday?.sessionDate, "2026-09-18");
  assert.equal(prints.friday?.close, 222.27);
  assert.equal(prints.prior?.sessionDate, "2026-09-22");
  assert.equal(prints.prior?.close, 225);
  const gaps = cashGaps(227.5, prints);
  assert.ok(gaps.vsFriday != null && Math.abs(gaps.vsFriday - ((227.5 - 222.27) / 222.27) * 100) < 1e-9);
});

test("RWA previousClose on a weekend is both prior and Friday", () => {
  const now = new Date("2026-09-19T18:00:00Z");
  const prints = cashPrintsFromRwaMarket("NVDA", { previousClose: 222.27, open: 220, last: 223, referencePrice: 222.4 }, now);
  assert.equal(lastCompletedBusinessYmd(now), "2026-09-18");
  assert.equal(lastFridayYmd(now), "2026-09-18");
  assert.equal(prints.prior?.close, 222.27);
  assert.equal(prints.prior?.sessionDate, "2026-09-18");
  assert.equal(prints.friday?.close, 222.27);
  assert.equal(prints.friday?.sessionDate, "2026-09-18");
  const onchain = 224.27;
  const gap = ((onchain - prints.friday!.close) / prints.friday!.close) * 100;
  assert.ok(Math.abs(gap - ((224.27 - 222.27) / 222.27) * 100) < 1e-9);
  assert.equal(prints.today, null);
});

test("RWA previousClose on Wednesday is prior; Yahoo still supplies Friday", () => {
  const now = new Date("2026-09-23T18:00:00Z");
  const rwa = cashPrintsFromRwaMarket("NVDA", { previousClose: 225, open: 223.5, last: 226, referencePrice: 225.1 }, now);
  assert.equal(lastCompletedBusinessYmd(now), "2026-09-22");
  assert.equal(rwa.prior?.close, 225);
  assert.equal(rwa.friday, null);
  const yahoo = cashPrintsFromBars(
    "NVDA",
    [
      { t: unix("2026-09-18T13:30:00Z"), open: 220, close: 222.27 },
      { t: unix("2026-09-22T13:30:00Z"), open: 223.5, close: 225 },
    ],
    now,
  );
  const merged = mergePrints(rwa, yahoo);
  assert.equal(merged.prior?.close, 225);
  assert.equal(merged.friday?.close, 222.27);
  assert.equal(merged.friday?.sessionDate, "2026-09-18");
});

test("weekend clock: prior session is Friday", () => {
  const bars = [
    { t: unix("2026-09-18T13:30:00Z"), open: 220, close: 222.27 },
    { t: unix("2026-09-17T13:30:00Z"), open: 218, close: 219 },
  ];
  const prints = cashPrintsFromBars("NVDA", bars, new Date("2026-09-19T18:00:00Z"));
  assert.equal(prints.prior?.sessionDate, "2026-09-18");
  assert.equal(prints.friday?.sessionDate, "2026-09-18");
  assert.equal(shortYmd("2026-09-18"), "Sep 18");
});
