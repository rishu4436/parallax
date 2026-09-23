import assert from "node:assert/strict";
import test from "node:test";
import { splitBasket } from "./baskets";
import { parsePlainRule } from "./plainRule";
import type { DcaSpec, FlattenSpec, GapFadeSpec } from "./types";

test("a basket splits the total and the last name takes the remainder", () => {
  const slices = splitBasket("40", ["NVDA", "AMD", "AAPL"]);
  assert.deepEqual(slices.map((slice) => slice.usdt), ["13.33", "13.33", "13.34"]);
});

test("plain English becomes a weekday DCA job", () => {
  const result = parsePlainRule("buy 10 NVDA every weekday at the open", 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.type, "dca");
  assert.deepEqual((result.job.spec as DcaSpec).tickers, ["NVDA"]);
  assert.equal((result.job.spec as DcaSpec).usdtEach, "10");
  assert.match(result.summary, /weekday/);
});

test("a discount sentence becomes a prior-close buy", () => {
  const result = parsePlainRule("buy 8 NVDA when it is 1.5% below yesterday", 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.type, "gap_fade");
  assert.equal((result.job.spec as GapFadeSpec).discountPct, 1.5);
});

test("an earnings sentence keeps the print time", () => {
  const result = parsePlainRule("flatten AAPL before the print at 2026-10-20 16:30", 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.job.type, "flatten_earnings");
  assert.equal((result.job.spec as FlattenSpec).printAt, "2026-10-20T16:30");
});

test("the AI basket sentence buys both chip names", () => {
  const result = parsePlainRule("buy 20 of the AI chips basket every hour", 4);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual((result.job.spec as DcaSpec).tickers, ["NVDA", "AMD"]);
  assert.equal((result.job.spec as DcaSpec).usdtEach, "10.00");
});
