import assert from "node:assert/strict";
import test from "node:test";
import { formatAge, formatBps, formatLiq, formatPct, formatPx, formatTtl, formatUsdt, quoteFreshness, shortAddr } from "./amounts";

test("formatPx uses two decimals above a dollar and four below", () => {
  assert.equal(formatPx(224.27), "$224.27");
  assert.equal(formatPx(0.04125), "$0.0413");
  assert.equal(formatPx(Number.NaN), "—");
});

test("formatPct keeps a plus on gains and an em dash on missing", () => {
  assert.equal(formatPct(0.9), "+0.90%");
  assert.equal(formatPct(-0.55), "-0.55%");
  assert.equal(formatPct(Number.NaN), "—");
});

test("desk number helpers print units and refuse zero liquidity", () => {
  assert.equal(formatUsdt(10), "10.00 USDT");
  assert.equal(formatBps(12.4), "12 bps");
  assert.equal(formatLiq(425820), "425,820");
  assert.equal(formatLiq(0), "—");
});

test("quote freshness uses the 30s TTL clock", () => {
  assert.equal(formatTtl(17_000), "00:17");
  assert.equal(formatAge(12_000), "12s");
  const live = quoteFreshness(1_000, 900);
  assert.equal(live.stale, false);
  assert.equal(live.label, "00:01");
  const dead = quoteFreshness(1_000, 1_000);
  assert.equal(dead.stale, true);
  assert.equal(dead.label, "QUOTE STALE");
});

test("shortAddr keeps the 0x prefix", () => {
  assert.equal(shortAddr("0x8a44209246C8dFA9BB5001363074F15b0Cb00209"), "0x8a44…0209");
});
