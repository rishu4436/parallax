import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_SCENARIOS, limitsFromSettings } from "./flag";
import { replayComplete, replayScenario, replayScript, visibleFrames } from "./replayView";
import type { Settings } from "./types";

const settings: Settings = {
  orderCapUsdt: 25,
  dailyCapUsdt: 100,
  allowedRails: ["bStock", "ondo", "xStock"],
  killSwitch: false,
  minNetEdgePct: 0.5,
  maxSlipPct: 0.5,
  minLiquidityUsd: 100_000,
  approvalRequired: true,
};

test("replay uses the existing scenario catalog", () => {
  assert.deepEqual(
    DEMO_SCENARIOS.map((row) => row.id),
    ["gap-closed", "cross-wrapper", "low-liq", "low-edge", "sim-ok", "agent-watch"],
  );
  assert.equal(replayScenario("gap-closed").card.reference, 178.42);
  assert.notEqual(replayScenario("gap-closed").card.perShare, replayScenario("gap-closed").card.reference);
});

test("blocked scenarios stop at policy and never claim a fill", () => {
  const limits = limitsFromSettings(settings, 10);
  for (const id of ["low-liq", "low-edge"] as const) {
    const script = replayScript(replayScenario(id), limits);
    assert.equal(script.policyPass, false);
    assert.equal(script.frames.some((frame) => frame.state === "blocked"), true);
    assert.equal(script.frames.some((frame) => /FILLED|SIGNED|SUBMITTED/.test(frame.detail)), false);
    assert.equal(script.boundary.includes("NO LIVE TRANSACTION"), true);
  }
  assert.match(replayScript(replayScenario("low-liq"), limits).reasons.join(" "), /Liquidity/);
  assert.match(replayScript(replayScenario("low-edge"), limits).reasons.join(" "), /Net edge/);
});

test("sim-ok stops at a signature boundary and agent-watch does not fill", () => {
  const limits = limitsFromSettings(settings, 10);
  const sim = replayScript(replayScenario("sim-ok"), limits);
  assert.equal(sim.policyPass, true);
  assert.match(sim.frames.map((frame) => frame.detail).join(" "), /READY FOR SIGNATURE/);
  assert.equal(sim.frames.some((frame) => frame.title === "RECEIPT"), false);
  const agent = replayScript(replayScenario("agent-watch"), limits);
  assert.match(agent.frames.map((frame) => frame.detail).join(" "), /WOULD HAND OFF/);
  assert.match(agent.frames.map((frame) => frame.detail).join(" "), /No receipt/);
});

test("stepping is deterministic and does not invent frames", () => {
  const script = replayScript(replayScenario("cross-wrapper"), limitsFromSettings(settings, 10));
  assert.deepEqual(visibleFrames(script, 0), []);
  assert.equal(visibleFrames(script, 1)[0]?.title, "MARKET");
  assert.equal(visibleFrames(script, 2).length, 2);
  assert.equal(visibleFrames(script, 99).length, script.frames.length);
  assert.equal(replayComplete(script, script.frames.length), true);
  assert.equal(replayComplete(script, 1), false);
  const again = replayScript(replayScenario("cross-wrapper"), limitsFromSettings(settings, 10));
  assert.deepEqual(again.frames, script.frames);
});
