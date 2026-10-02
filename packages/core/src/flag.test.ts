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

test("a halted rail with no quote does not invent a 0% edge or 0 liquidity failure", () => {
  const card = {
    ...DEMO_SCENARIOS[0].card,
    status: "HALTED" as const,
    perShare: null,
    grossPct: null,
    slipPct: null,
    costPct: null,
    feePct: null,
    netPct: null,
    liquidity: null,
    complete: false,
  };
  const gate = evaluateLimits(card, limits, 10);
  assert.equal(gate.pass, false);
  assert.deepEqual(gate.fails, ["Rail is HALTED."]);
  const lines = flagReasons({ cashOpen: false, card, limits, sizeUsdt: 10 });
  assert.equal(lines.some((line) => line.includes("0.00%")), false);
  assert.match(lines.join(" "), /no quote/i);
});

test("measured zero liquidity is not a missing-book failure", () => {
  const card = { ...DEMO_SCENARIOS[0].card, liquidity: 0 };
  const sized = limitsFromSettings(undefined, 10);
  const gate = evaluateLimits(card, sized, 10);
  assert.equal(gate.pass, true);
  const lines = flagReasons({ cashOpen: false, card, limits: sized, sizeUsdt: 10 });
  assert.match(lines.join(" "), /Observed liquidity is 0/);
  assert.equal(lines.some((line) => /Liquidity 0 is below/.test(line)), false);
});

test("unmeasured slip is not reported as 0%", () => {
  const card = { ...DEMO_SCENARIOS[0].card, complete: false, slipPct: null };
  const gate = evaluateLimits(card, limits, 10);
  assert.equal(gate.fails.some((line) => line.startsWith("Slip ")), false);
  const lines = flagReasons({ cashOpen: false, card, limits, sizeUsdt: 10 });
  assert.match(lines.join(" "), /not measured/i);
  assert.equal(lines.some((line) => line.includes("0.00%")), false);
});

test("thin net edge fails the 0.50% threshold", () => {
  const card = DEMO_SCENARIOS.find((row) => row.id === "low-edge")!.card;
  const gate = evaluateLimits(card, limits, 500);
  assert.equal(gate.pass, false);
  assert.match(gate.fails.join(" "), /below/);
});
