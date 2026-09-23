import assert from "node:assert/strict";
import test from "node:test";
import { cashGaps, cashPrintsFromBars, shortYmd } from "./friday";

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
