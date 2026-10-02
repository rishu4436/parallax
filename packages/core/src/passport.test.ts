import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHash, canonicalJson, sha256Hex } from "./canonical";
import {
  PASSPORT_STATES,
  derivePassportState,
  issuePassport,
  passportFromBook,
  prepareSnapshot,
  refreshPassport,
  type IssuePassportInput,
  type PassportState,
} from "./passport";
import type { Intent, RailBook, Settings, VenueQuote, Wrapper } from "./types";
import { COPY, QUOTE_TTL_MS } from "./types";

function wrapper(rail: Wrapper["rail"] = "xStock", symbol = "NVDAx"): Wrapper {
  return {
    rail,
    type: rail === "ondo" ? 1 : rail === "xStock" ? 2 : 3,
    symbol,
    address: "0xC845B2894DbDdD03858fD2d643B4ef725FE0849d",
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
    quoteExpiresAt: 1_000 + QUOTE_TTL_MS,
    inAmount: "10000000000000000000",
    outAmount: "100000000000000000",
    mid: 102,
    perShare: 102,
    slipBps50: 10,
    slipBps500: 40,
    slipKnown: true,
    gasUsd: 0.02,
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
  wallet: "0xABCDEF0000000000000000000000000000000001",
  actor: "user",
};

function issue(partial: Partial<IssuePassportInput> = {}) {
  return issuePassport({
    intent,
    quote: quote(),
    underlying: { ticker: "NVDA", name: "NVIDIA" },
    reference: { price: 100, label: "prior cash close" },
    settings,
    spentToday: 0,
    now: 1_000,
    ...partial,
  });
}

test("sha256 matches FIPS empty and abc vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("canonicalJson sorts keys and omits undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: 1, z: undefined, b: { d: 4, c: 3 } }), '{"a":1,"b":{"c":3,"d":4}}');
  assert.equal(canonicalJson({ n: Number.NaN, i: Infinity }), '{"i":null,"n":null}');
  assert.equal(canonicalHash({ b: 1, a: 2 }), canonicalHash({ a: 2, b: 1 }));
});

test("catalog covers every passport state", () => {
  assert.deepEqual([...PASSPORT_STATES], [
    "quoted",
    "incomplete",
    "expired",
    "rail_closed",
    "offline",
    "rejected",
    "needs_approval",
    "sim_failed",
    "ready",
  ]);
});

test("quoted: live executable quote with measured slip and no prepare", () => {
  const passport = issue();
  assert.equal(passport.state, "quoted");
  assert.equal(passport.body.intent.ticker, "NVDA");
  assert.equal(passport.body.underlying.name, "NVIDIA");
  assert.equal(passport.body.representation.symbol, "NVDAx");
  assert.equal(passport.body.vendor, "LiquidMesh");
  assert.equal(passport.body.executionMode, "SWAP");
  assert.equal(passport.body.quotedAt, 1_000);
  assert.equal(passport.body.expiresAt, 1_000 + QUOTE_TTL_MS);
  assert.equal(passport.body.reference.price, 100);
  assert.equal(passport.body.multiplier, 1);
  assert.equal(passport.body.priceImpact.source, "slipBps50");
  assert.equal(passport.body.priceImpact.percent, 0.1);
  assert.equal(passport.body.networkFee.source, "tradeFee");
  assert.equal(passport.body.gasEstimate.source, "tradeFee");
  assert.equal(passport.body.networkFee.usd, passport.body.gasEstimate.usd);
  assert.equal(passport.body.networkFee.usd, 0.02);
  assert.equal(passport.body.simulation.status, "NONE");
  assert.match(passport.hash, /^[0-9a-f]{64}$/);
});

test("incomplete: slip was not measured", () => {
  const passport = issue({ quote: quote({ slipKnown: false, slipBps50: 0 }) });
  assert.equal(passport.state, "incomplete");
  assert.equal(passport.body.quote.slipKnown, false);
  assert.equal(passport.body.priceImpact.source, "unknown");
  assert.equal(passport.body.priceImpact.percent, null);
});

test("incomplete: missing reference is not invented as 0", () => {
  const passport = issue({ reference: { price: null, label: "unavailable" } });
  assert.equal(passport.state, "incomplete");
  assert.equal(passport.body.reference.price, null);
  assert.notEqual(passport.body.reference.price, 0);
  assert.equal(passport.canonical.includes('"price":0'), false);
});

test("expired: clock past TTL does not change the hash", () => {
  const live = issue({ now: 1_000 });
  const aged = refreshPassport(live, 1_000 + QUOTE_TTL_MS);
  assert.equal(live.state, "quoted");
  assert.equal(aged.state, "expired");
  assert.equal(aged.hash, live.hash);
  assert.equal(aged.canonical, live.canonical);
  assert.equal(aged.reason, COPY.quoteExpired);
});

test("rail_closed: 40367 US hours", () => {
  const passport = issue({
    quote: quote({ ok: false, errorCode: 40367, errorText: "40367 US hours", perShare: 0, outAmount: "0" }),
  });
  assert.equal(passport.state, "rail_closed");
});

test("rail_closed: 40369 US hours", () => {
  const passport = issue({
    quote: quote({ ok: false, errorCode: 40369, errorText: "40369 US hours", perShare: 0, outAmount: "0" }),
  });
  assert.equal(passport.state, "rail_closed");
});

test("offline: quote failed without a session code", () => {
  const passport = issue({
    quote: quote({ ok: false, errorCode: 500, errorText: "upstream", perShare: 0, outAmount: "0" }),
  });
  assert.equal(passport.state, "offline");
});

test("rejected: kill switch", () => {
  const passport = issue({ settings: { ...settings, killSwitch: true } });
  assert.equal(passport.state, "rejected");
  assert.equal(passport.reason, COPY.killSwitch);
});

test("rejected: agent order cap", () => {
  const passport = issue({
    intent: { ...intent, actor: "agent", usdt: "40" },
  });
  assert.equal(passport.state, "rejected");
  assert.match(passport.reason, /Order cap/);
});

test("user actor skips the order cap", () => {
  const passport = issue({
    intent: { ...intent, actor: "user", usdt: "40" },
  });
  assert.equal(passport.state, "quoted");
  const cap = passport.body.policy.find((row) => row.id === "order_cap");
  assert.equal(cap?.pass, true);
});

test("rejected: rail turned off", () => {
  const passport = issue({
    settings: { ...settings, allowedRails: ["ondo"] },
  });
  assert.equal(passport.state, "rejected");
  assert.match(passport.reason, /turned off/);
});

test("rejected: net edge below threshold", () => {
  const passport = issue({
    quote: quote({ perShare: 100.2, mid: 100.2 }),
  });
  assert.equal(passport.state, "rejected");
  assert.match(passport.reason, /Net edge/);
});

test("rejected: slip above max", () => {
  const passport = issue({
    quote: quote({ slipBps50: 80, slipKnown: true }),
  });
  assert.equal(passport.state, "rejected");
  assert.match(passport.reason, /Slip /);
});

test("rejected: prepare step rejected", () => {
  const passport = issue({
    prepare: { step: "rejected", message: "Wallet mismatch" },
  });
  assert.equal(passport.state, "rejected");
});

test("needs_approval: prepare returned approve", () => {
  const passport = issue({
    prepare: { step: "approve", spender: "0x1", tx: { data: "0xdeadbeef", to: "0x2", from: "0x3", value: "0" } },
  });
  assert.equal(passport.state, "needs_approval");
  assert.equal(passport.canonical.includes("0xdeadbeef"), false);
  assert.equal(passport.body.simulation.step, "approve");
});

test("sim_failed: SWAP simulation FAILED", () => {
  const passport = issue({
    prepare: { step: "sign-swap", simulateStatus: "FAILED", simulateReason: "ERC20InsufficientBalance", tx: { data: "0xdeadbeefcafe" } },
  });
  assert.equal(passport.state, "sim_failed");
  assert.match(passport.reason, /does not hold enough/);
  assert.equal(passport.canonical.includes("0xdeadbeefcafe"), false);
});

test("ready: SWAP simulate SUCCESS", () => {
  const passport = issue({
    prepare: { step: "sign-swap", simulateStatus: "SUCCESS", tx: { data: "0xsignedata", to: "0xrouter" } },
  });
  assert.equal(passport.state, "ready");
  assert.equal(passport.body.simulation.status, "SUCCESS");
  assert.equal(passport.canonical.includes("0xsignedata"), false);
  assert.equal(JSON.stringify(passport.body).includes("typedData"), false);
});

test("ready: RFQ has no EVM simulate", () => {
  const passport = issue({
    quote: quote({ executionMode: "RFQ", vendorName: "Ondo" }),
    prepare: { step: "sign-rfq", typedData: "{\"primaryType\":\"Order\"}", vendor: "Ondo", quoteId: "q-live" },
  });
  assert.equal(passport.state, "ready");
  assert.equal(passport.body.executionMode, "RFQ");
  assert.equal(passport.body.simulation.status, "NONE");
  assert.equal(passport.body.simulation.step, "sign-rfq");
  assert.equal(passport.canonical.includes("typedData"), false);
  assert.equal(passport.canonical.includes("primaryType"), false);
});

test("every PASSPORT_STATES value is reachable", () => {
  const byState: Record<PassportState, ReturnType<typeof issue>> = {
    quoted: issue(),
    incomplete: issue({ quote: quote({ slipKnown: false }) }),
    expired: refreshPassport(issue(), 40_000),
    rail_closed: issue({ quote: quote({ ok: false, errorCode: 40367, errorText: "closed" }) }),
    offline: issue({ quote: quote({ ok: false, errorCode: 1, errorText: "down" }) }),
    rejected: issue({ settings: { ...settings, killSwitch: true } }),
    needs_approval: issue({ prepare: { step: "approve" } }),
    sim_failed: issue({ prepare: { step: "sign-swap", simulateStatus: "FAILED", simulateReason: "revert" } }),
    ready: issue({ prepare: { step: "sign-swap", simulateStatus: "SUCCESS" } }),
  };
  for (const state of PASSPORT_STATES) {
    assert.equal(byState[state].state, state, state);
  }
});

test("hash is independent of object key insertion order", () => {
  const a = issue();
  const b = issue({
    settings: {
      approvalRequired: true,
      allowedRails: ["bStock", "ondo", "xStock"],
      dailyCapUsdt: 100,
      killSwitch: false,
      maxSlipPct: 0.5,
      minLiquidityUsd: 100_000,
      minNetEdgePct: 0.5,
      orderCapUsdt: 25,
    },
  });
  assert.equal(a.hash, b.hash);
});

test("hash changes when quoteId changes", () => {
  const a = issue({ quote: quote({ quoteId: "q-a" }) });
  const b = issue({ quote: quote({ quoteId: "q-b" }) });
  assert.notEqual(a.hash, b.hash);
});

test("attaching simulation changes the hash", () => {
  const quoted = issue();
  const ready = issue({ prepare: { step: "sign-swap", simulateStatus: "SUCCESS" } });
  assert.notEqual(quoted.hash, ready.hash);
  assert.equal(quoted.state, "quoted");
  assert.equal(ready.state, "ready");
});

test("priceImpactPercent on the raw route wins over slip bps", () => {
  const passport = issue({
    quote: quote({ raw: { priceImpactPercent: "0.42" } }),
  });
  assert.equal(passport.body.priceImpact.source, "priceImpactPercent");
  assert.equal(passport.body.priceImpact.percent, 0.42);
});

test("missing tradeFee is unknown, not a second invented fee", () => {
  const passport = issue({ quote: quote({ gasUsd: 0 }) });
  assert.equal(passport.body.networkFee.usd, null);
  assert.equal(passport.body.gasEstimate.usd, null);
  assert.equal(passport.body.networkFee.source, "tradeFee");
  assert.equal(passport.body.gasEstimate.source, "tradeFee");
});

test("prepareSnapshot drops tx and typedData", () => {
  const snap = prepareSnapshot({
    step: "sign-rfq",
    typedData: "SECRET",
    vendor: "Ondo",
    quoteId: "q",
    tx: { data: "0xdead" },
  });
  assert.deepEqual(snap, { step: "sign-rfq" });
  assert.equal("typedData" in (snap || {}), false);
  assert.equal("tx" in (snap || {}), false);
});

test("wallet is canonicalized lowercase", () => {
  const passport = issue();
  assert.equal(passport.body.intent.wallet, "0xabcdef0000000000000000000000000000000001");
});

test("passportFromBook uses the selected rail quote and book reference", () => {
  const row: RailBook = {
    wrapper: wrapper("bStock", "NVDAB"),
    routes: [quote({ wrapper: wrapper("bStock", "NVDAB"), vendorName: "Binance" })],
    best: quote({ wrapper: wrapper("bStock", "NVDAB"), vendorName: "Binance" }),
    badge: "RFQ",
    status: "OPEN",
  };
  const passport = passportFromBook({
    intent: { ...intent, railLock: "bStock" },
    book: {
      underlying: { ticker: "NVDA", name: "NVIDIA" },
      books: [row],
      best: row,
      fridayClose: 99,
      priorClose: 100.5,
      referencePrice: 101,
    },
    settings,
    spentToday: 0,
    now: 1_000,
  });
  assert.ok(passport);
  assert.equal(passport?.body.representation.symbol, "NVDAB");
  assert.equal(passport?.body.reference.price, 100.5);
  assert.equal(passport?.body.reference.label, "prior cash close");
});

test("derivePassportState is a pure function of body and now", () => {
  const live = issue();
  assert.equal(derivePassportState(live.body, 1_000), "quoted");
  assert.equal(derivePassportState(live.body, 40_000), "expired");
});
