import assert from "node:assert/strict";
import test from "node:test";
import { COPY } from "./types";
import type { Intent, Settings, VenueQuote, Wrapper } from "./types";
import {
  POLICY_CHECK_IDS,
  POLICY_SOURCES,
  POLICY_VERDICTS,
  assertBuildAllowed,
  confirmGate,
  evaluatePolicy,
  policyAllowsApprove,
  policyAllowsSend,
  policyPublic,
  type PolicyProposal,
  type PolicySource,
  type PolicyVerdict,
} from "./policy";
import { RouterReject } from "./router";

function wrapper(rail: Wrapper["rail"] = "xStock"): Wrapper {
  return {
    rail,
    type: rail === "ondo" ? 1 : rail === "xStock" ? 2 : 3,
    symbol: rail === "ondo" ? "NVDAon" : rail === "bStock" ? "NVDAB" : "NVDAx",
    address: "0x0000000000000000000000000000000000000001",
    decimals: 18,
    multiplier: 1,
  };
}

function quote(partial: Partial<VenueQuote> = {}): VenueQuote {
  return {
    wrapper: wrapper(),
    ok: true,
    executionMode: "SWAP",
    vendorName: "LiquidMesh",
    quoteId: "q-live",
    quoteExpiresAt: 31_000,
    inAmount: "10000000000000000000",
    outAmount: "100000000000000000",
    mid: 102,
    perShare: 102,
    slipBps50: 10,
    slipBps500: 40,
    slipKnown: true,
    gasUsd: 0.02,
    userWalletAddress: "0x0000000000000000000000000000000000000001",
    raw: {},
    ...partial,
  };
}

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

const intent: Intent = {
  ticker: "NVDA",
  side: "buy",
  usdt: "10",
  wallet: "0x0000000000000000000000000000000000000001",
  actor: "agent",
};

function propose(partial: Partial<PolicyProposal> = {}): ReturnType<typeof evaluatePolicy> {
  return evaluatePolicy({
    source: "agentic",
    mode: "execute",
    intent,
    settings,
    spentToday: 0,
    now: 1_000,
    quote: quote(),
    signer: intent.wallet,
    reference: { price: 100, label: "prior cash close" },
    simulateStatus: "SUCCESS",
    prepareStep: "sign-swap",
    ...partial,
  });
}

test("catalog covers every verdict and check", () => {
  assert.deepEqual([...POLICY_VERDICTS], ["PASS", "BLOCK", "REQUOTE", "WAIT"]);
  assert.deepEqual([...POLICY_CHECK_IDS], [
    "kill_switch",
    "allowed_rail",
    "order_cap",
    "daily_cap",
    "min_net_edge",
    "max_slippage",
    "min_liquidity",
    "quote_age",
    "market_status",
    "signer",
    "simulation",
  ]);
});

test("PASS: live SWAP with simulate SUCCESS", () => {
  const decision = propose();
  assert.equal(decision.verdict, "PASS");
  assert.equal(decision.nextAction, "sign");
  assert.equal(decision.failures.length, 0);
  assert.equal(policyAllowsSend(decision), true);
  assert.ok(decision.checks.every((row) => row.pass));
});

test("PASS: RFQ does not require EVM simulate", () => {
  const decision = propose({
    quote: quote({ executionMode: "RFQ" }),
    simulateStatus: "NONE",
    prepareStep: "sign-rfq",
  });
  assert.equal(decision.verdict, "PASS");
});

test("BLOCK: kill switch", () => {
  const decision = propose({ settings: { ...settings, killSwitch: true } });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "KILL_SWITCH");
  assert.equal(decision.primary?.human, COPY.killSwitch);
  assert.equal(decision.primary?.machine, "killSwitch=true");
  assert.equal(decision.primary?.nextAction, "clear_kill_switch");
});

test("BLOCK: rail turned off", () => {
  const decision = propose({
    quote: quote({ wrapper: wrapper("xStock") }),
    settings: { ...settings, allowedRails: ["ondo"] },
  });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "RAIL_DISABLED");
  assert.match(decision.primary?.human || "", /turned off/);
  assert.equal(decision.primary?.nextAction, "enable_rail");
});

test("BLOCK: agent order cap", () => {
  const decision = propose({ intent: { ...intent, usdt: "40" } });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "ORDER_CAP");
  assert.equal(decision.primary?.human, "Order cap is 25 USDT.");
  assert.equal(decision.primary?.nextAction, "reduce_size");
});

test("user actor skips the order cap", () => {
  const decision = propose({ source: "ui", intent: { ...intent, actor: "user", usdt: "40" } });
  assert.equal(decision.verdict, "PASS");
});

test("BLOCK: daily cap", () => {
  const decision = propose({ spentToday: 95 });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "DAILY_CAP");
  assert.match(decision.primary?.machine || "", /spentToday=95/);
});

test("BLOCK: amount invalid", () => {
  const decision = propose({ intent: { ...intent, usdt: "0" } });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "AMOUNT_INVALID");
});

test("BLOCK: net edge below minimum", () => {
  const decision = propose({ quote: quote({ perShare: 100.2, mid: 100.2 }) });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "MIN_NET_EDGE");
  assert.match(decision.primary?.human || "", /Net edge/);
});

test("BLOCK: slippage above maximum", () => {
  const decision = propose({ quote: quote({ slipBps50: 80, slipKnown: true }) });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "MAX_SLIPPAGE");
});

test("unknown slip does not fail max slippage", () => {
  const decision = propose({ quote: quote({ slipKnown: false, slipBps50: 0 }) });
  assert.equal(decision.verdict, "PASS");
  assert.equal(decision.checks.find((row) => row.id === "max_slippage")?.pass, true);
});

test("BLOCK: liquidity below minimum", () => {
  const decision = propose({ liquidity: 12_000 });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "MIN_LIQUIDITY");
});

test("unknown liquidity does not fail", () => {
  const decision = propose({ liquidity: 0 });
  assert.equal(decision.verdict, "PASS");
});

test("BLOCK: rail halted", () => {
  const decision = propose({
    quote: quote({ ok: false, errorCode: 40365, errorText: "halted", perShare: 0, outAmount: "0" }),
    simulateStatus: "NONE",
    prepareStep: undefined,
  });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "MARKET_HALTED");
});

test("REQUOTE: quote expired", () => {
  const decision = propose({ now: 40_000 });
  assert.equal(decision.verdict, "REQUOTE");
  assert.equal(decision.primary?.code, "QUOTE_EXPIRED");
  assert.equal(decision.primary?.human, COPY.quoteExpired);
  assert.equal(decision.primary?.nextAction, "requote");
});

test("REQUOTE: wallet mismatch", () => {
  const decision = propose({ signer: "0x00000000000000000000000000000000000000aa" });
  assert.equal(decision.verdict, "REQUOTE");
  assert.equal(decision.primary?.code, "WALLET_MISMATCH");
  assert.equal(decision.primary?.nextAction, "requote_with_signer");
});

test("REQUOTE: simulation failed", () => {
  const decision = propose({ simulateStatus: "FAILED", simulateReason: "ERC20InsufficientBalance" });
  assert.equal(decision.verdict, "REQUOTE");
  assert.equal(decision.primary?.code, "SIM_FAILED");
  assert.match(decision.primary?.human || "", /does not hold enough/);
});

test("REQUOTE: market offline", () => {
  const decision = propose({
    quote: quote({ ok: false, errorCode: 500, errorText: "upstream", perShare: 0, outAmount: "0" }),
    simulateStatus: "NONE",
    prepareStep: undefined,
  });
  assert.equal(decision.verdict, "REQUOTE");
  assert.equal(decision.primary?.code, "MARKET_OFFLINE");
});

test("WAIT: US hours closed rail", () => {
  const decision = propose({
    quote: quote({ ok: false, errorCode: 40367, errorText: "40367 US hours", perShare: 0, outAmount: "0" }),
    simulateStatus: "NONE",
    prepareStep: undefined,
  });
  assert.equal(decision.verdict, "WAIT");
  assert.equal(decision.primary?.code, "MARKET_CLOSED");
  assert.equal(decision.primary?.nextAction, "wait_session");
});

test("WAIT: SWAP execute without simulate", () => {
  const decision = propose({ simulateStatus: "NONE", prepareStep: undefined });
  assert.equal(decision.verdict, "WAIT");
  assert.equal(decision.primary?.code, "SIM_REQUIRED");
  assert.equal(decision.primary?.nextAction, "simulate");
});

test("WAIT: simulate pending", () => {
  const decision = propose({ simulateStatus: "PENDING", prepareStep: "sign-swap" });
  assert.equal(decision.verdict, "WAIT");
  assert.equal(decision.primary?.code, "SIM_PENDING");
});

test("WAIT: UI approve step", () => {
  const decision = propose({ source: "ui", prepareStep: "approve", simulateStatus: "NONE" });
  assert.equal(decision.verdict, "WAIT");
  assert.equal(decision.primary?.code, "SIM_PENDING");
  assert.equal(decision.primary?.nextAction, "approve");
});

test("preview mode does not require simulation", () => {
  const decision = propose({ mode: "preview", simulateStatus: undefined, prepareStep: undefined });
  assert.equal(decision.verdict, "PASS");
});

test("every verdict is reachable", () => {
  const byVerdict: Record<PolicyVerdict, ReturnType<typeof propose>> = {
    PASS: propose(),
    BLOCK: propose({ settings: { ...settings, killSwitch: true } }),
    REQUOTE: propose({ now: 40_000 }),
    WAIT: propose({ simulateStatus: "NONE", prepareStep: undefined }),
  };
  for (const verdict of POLICY_VERDICTS) {
    assert.equal(byVerdict[verdict].verdict, verdict, verdict);
    if (verdict !== "PASS") {
      assert.ok(byVerdict[verdict].primary?.code);
      assert.ok(byVerdict[verdict].primary?.human);
      assert.ok(byVerdict[verdict].primary?.machine);
      assert.ok(byVerdict[verdict].primary?.nextAction);
    }
  }
});

test("BLOCK outranks REQUOTE when kill switch and quote are both dead", () => {
  const decision = propose({ now: 40_000, settings: { ...settings, killSwitch: true } });
  assert.equal(decision.verdict, "BLOCK");
  assert.equal(decision.primary?.code, "KILL_SWITCH");
  assert.ok(decision.failures.some((row) => row.code === "QUOTE_EXPIRED"));
});

test("assertBuildAllowed throws the same kill and cap strings", () => {
  assert.throws(
    () => assertBuildAllowed(intent, { ...settings, killSwitch: true }, 0),
    (err: unknown) => err instanceof RouterReject && err.message === COPY.killSwitch,
  );
  assert.throws(() => assertBuildAllowed({ ...intent, usdt: "40" }, settings, 0), /Order cap/);
  assert.doesNotThrow(() => assertBuildAllowed({ ...intent, actor: "user", usdt: "40" }, settings, 0));
});

test("confirmGate expired and failed simulate still match the sign modal", () => {
  const dead = confirmGate({
    now: 31_000,
    quoteExpiresAt: 30_000,
    simulateStatus: "SUCCESS",
    executionMode: "SWAP",
    state: "awaiting_signature",
  });
  assert.equal(dead.sign, false);
  assert.equal(dead.expired, true);
  assert.equal(dead.reason, COPY.quoteExpired);
  const failed = confirmGate({
    now: 1_000,
    quoteExpiresAt: 31_000,
    simulateStatus: "FAILED",
    simulateReason: "ERC20InsufficientBalance",
    executionMode: "SWAP",
    state: "awaiting_signature",
  });
  assert.equal(failed.sign, false);
  assert.match(failed.reason || "", /does not hold enough/);
});

test("every source can PASS the same live SWAP", () => {
  for (const source of POLICY_SOURCES) {
    const decision = propose({ source });
    assert.equal(decision.verdict, "PASS", source);
    assert.equal(decision.source, source);
  }
});

test("baw market-order skips EVM simulation", () => {
  const decision = propose({
    source: "strategy",
    simulateStatus: "NONE",
    prepareStep: undefined,
    requireSimulation: false,
  });
  assert.equal(decision.verdict, "PASS");
  assert.equal(decision.checks.find((row) => row.id === "simulation")?.pass, true);
});

test("closed rail does not also fail simulation", () => {
  const decision = propose({
    quote: quote({ ok: false, errorCode: 40367, errorText: "40367 US hours", perShare: 0, outAmount: "0" }),
    simulateStatus: "NONE",
    prepareStep: undefined,
  });
  assert.equal(decision.verdict, "WAIT");
  assert.equal(decision.failures.length, 1);
  assert.equal(decision.primary?.code, "MARKET_CLOSED");
});

test("policyPublic puts code human machine nextAction on every failure", () => {
  const decision = propose({ settings: { ...settings, killSwitch: true } });
  const pub = policyPublic(decision);
  assert.equal(pub.verdict, "BLOCK");
  assert.ok(pub.primary);
  for (const row of pub.failures) {
    assert.ok(row.code);
    assert.ok(row.human);
    assert.ok(row.machine);
    assert.ok(row.nextAction);
  }
  const kill = pub.checks.find((row) => row.id === "kill_switch");
  assert.equal(kill?.pass, false);
  assert.equal(kill?.code, "KILL_SWITCH");
});

test("WAIT does not allow send; UI approve is a separate next action", () => {
  const waiting = propose({ simulateStatus: "NONE", prepareStep: undefined });
  assert.equal(policyAllowsSend(waiting), false);
  const approve = propose({ source: "ui", prepareStep: "approve", simulateStatus: "NONE" });
  assert.equal(approve.verdict, "WAIT");
  assert.equal(policyAllowsApprove(approve), true);
  assert.equal(policyAllowsSend(approve), false);
});

test("mcp and studio evaluate and never become a send", () => {
  const sources: PolicySource[] = ["mcp", "studio"];
  for (const source of sources) {
    const blocked = propose({ source, settings: { ...settings, killSwitch: true } });
    assert.equal(blocked.verdict, "BLOCK");
    assert.equal(policyAllowsSend(blocked), false);
  }
});
