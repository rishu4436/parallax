import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_SCENARIOS, evaluateLimits, flagReasons, limitsFromSettings } from "./flag";

const limits = limitsFromSettings(undefined, 500);

test("flag reasons name cash closed, the gap, and the net edge", () => {
  const card = DEMO_SCENARIOS[0].card;
  const lines = flagReasons({ cashOpen: false, card, limits, sizeUsdt: 500 });
  assert.match(lines[0], /closed/i);
  assert.match(lines.join(" "), /1\.54%/);
  assert.match(lines.join(" "), /net edge/i);
});

test("low liquidity fails the risk gate", () => {
  const card = DEMO_SCENARIOS.find((row) => row.id === "low-liq")!.card;
  const gate = evaluateLimits(card, limits, 500);
  assert.equal(gate.pass, false);
  assert.match(gate.fails.join(" "), /Liquidity/);
});

test("thin net edge fails the 0.50% threshold", () => {
  const card = DEMO_SCENARIOS.find((row) => row.id === "low-edge")!.card;
  const gate = evaluateLimits(card, limits, 500);
  assert.equal(gate.pass, false);
  assert.match(gate.fails.join(" "), /below/);
});
