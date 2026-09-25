import assert from "node:assert/strict";
import test from "node:test";
import { bookFromRoutes, confirmGate, isRfqExecution, isRfqRoute, needsSignerQuote, pickBest, assertBuildAllowed, RouterReject, scoreQuote, signerMatchesQuote } from "./router";
import { resolveQuery } from "./registry";
import type { RailBook, Settings, VenueQuote, Wrapper } from "./types";
import { COPY } from "./types";

function wrapper(rail: Wrapper["rail"], symbol: string): Wrapper {
  return {
    rail,
    type: rail === "ondo" ? 1 : rail === "xStock" ? 2 : 3,
    symbol,
    address: "0x0000000000000000000000000000000000000001",
    decimals: 18,
    multiplier: 1,
  };
}

function quote(partial: Partial<VenueQuote> & Pick<VenueQuote, "wrapper" | "outAmount" | "ok">): VenueQuote {
  return {
    errorCode: undefined,
    executionMode: "SWAP",
    vendorName: "LiquidMesh",
    quoteId: "q",
    quoteExpiresAt: 1_000 + 30_000,
    inAmount: "10000000000000000000",
    mid: 100,
    perShare: 100,
    slipBps50: 10,
    slipBps500: 40,
    slipKnown: true,
    gasUsd: 0.02,
    raw: {},
    ...partial,
  };
}

function book(q: VenueQuote): RailBook {
  return bookFromRoutes([q]);
}

const settings: Settings = {
  orderCapUsdt: 25,
  dailyCapUsdt: 100,
  allowedRails: ["bStock", "ondo", "xStock"],
  killSwitch: false,
};

test("resolve nvidia, NVDA, and NVDAB to the same underlying", () => {
  const a = resolveQuery("nvidia");
  const b = resolveQuery("NVDA");
  const c = resolveQuery("NVDAB");
  assert.equal(a?.underlying.ticker, "NVDA");
  assert.equal(b?.underlying.ticker, "NVDA");
  assert.equal(c?.underlying.ticker, "NVDA");
  assert.equal(c?.railLock, "bStock");
  assert.equal(a?.railLock, undefined);
  assert.ok(a?.underlying.wrappers.ondo?.address.startsWith("0x"));
  assert.ok(a?.underlying.wrappers.xStock?.address.startsWith("0x"));
  assert.ok(a?.underlying.wrappers.bStock?.address.startsWith("0x"));
});

test("locked NVDAB is not replaced by a better NVDAx", () => {
  const b = book(quote({ wrapper: wrapper("bStock", "NVDAB"), outAmount: "100000000000000000", ok: true, vendorName: "LiquidMesh" }));
  const x = book(quote({ wrapper: wrapper("xStock", "NVDAx"), outAmount: "500000000000000000", ok: true, vendorName: "Pancake", executionMode: "SWAP" }));
  const best = pickBest([b, x], "bStock");
  assert.equal(best?.wrapper.symbol, "NVDAB");
  assert.notEqual(best?.wrapper.symbol, "NVDAx");
});

test("higher output wins when nothing is locked", () => {
  const b = book(quote({ wrapper: wrapper("bStock", "NVDAB"), outAmount: "100000000000000000", ok: true }));
  const x = book(quote({ wrapper: wrapper("xStock", "NVDAx"), outAmount: "500000000000000000", ok: true }));
  assert.ok(scoreQuote(x.best!) > scoreQuote(b.best!));
  assert.equal(pickBest([b, x])?.wrapper.symbol, "NVDAx");
});

test("kill switch and order cap reject the build", () => {
  assert.throws(
    () => assertBuildAllowed({ ticker: "NVDA", side: "buy", usdt: "10", wallet: "0x0000000000000000000000000000000000000001" }, { ...settings, killSwitch: true }, 0),
    (err: unknown) => err instanceof RouterReject && err.message === COPY.killSwitch,
  );
  assert.throws(
    () => assertBuildAllowed({ ticker: "NVDA", side: "buy", usdt: "40", wallet: "0x0000000000000000000000000000000000000001", actor: "agent" }, settings, 0),
    /Order cap/,
  );
  assert.doesNotThrow(() =>
    assertBuildAllowed({ ticker: "NVDA", side: "buy", usdt: "40", wallet: "0x0000000000000000000000000000000000000001", actor: "user" }, settings, 0),
  );
});

test("31 seconds after the quote, only requote and cancel remain", () => {
  const gate = confirmGate({
    now: 31_000,
    quoteExpiresAt: 30_000,
    simulateStatus: "SUCCESS",
    executionMode: "SWAP",
    state: "awaiting_signature",
  });
  assert.equal(gate.expired, true);
  assert.equal(gate.sign, false);
  assert.equal(gate.requote, true);
  assert.equal(gate.cancel, true);
  assert.equal(gate.reason, COPY.quoteExpired);
});

test("a failed simulate disables sign", () => {
  const gate = confirmGate({
    now: 1_000,
    quoteExpiresAt: 31_000,
    simulateStatus: "FAILED",
    simulateReason: "ERC20InsufficientBalance",
    executionMode: "SWAP",
    state: "awaiting_signature",
  });
  assert.equal(gate.sign, false);
  assert.match(gate.reason || "", /does not hold enough/);
});

test("an RFQ quote is executable only for the wallet that requested it", () => {
  const ondo = quote({ wrapper: wrapper("ondo", "NVDAon"), outAmount: "1", ok: true, executionMode: "SWAP" });
  const bRfq = quote({ wrapper: wrapper("bStock", "NVDAB"), outAmount: "1", ok: true, executionMode: "RFQ" });
  const bSwap = quote({ wrapper: wrapper("bStock", "NVDAB"), outAmount: "1", ok: true, executionMode: "SWAP" });
  const xSwap = quote({ wrapper: wrapper("xStock", "NVDAx"), outAmount: "1", ok: true, executionMode: "SWAP" });
  assert.equal(needsSignerQuote(ondo), true);
  assert.equal(needsSignerQuote(bRfq), true);
  assert.equal(needsSignerQuote(bSwap), true);
  assert.equal(needsSignerQuote(xSwap), false);
  assert.equal(isRfqRoute(bSwap), true);
  assert.equal(isRfqExecution(ondo), false);
  assert.equal(isRfqExecution(bRfq), true);
  assert.equal(isRfqExecution(bSwap), false);
  assert.equal(signerMatchesQuote("0xAbC", "0xabc"), true);
  assert.equal(signerMatchesQuote("0xabc", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"), false);
  assert.equal(signerMatchesQuote("0xabc", undefined), false);
});

test("closed rail error text keeps the code", () => {
  const closed = bookFromRoutes([
    quote({
      wrapper: wrapper("ondo", "NVDAon"),
      ok: false,
      outAmount: "0",
      executionMode: undefined,
      errorCode: 40367,
      errorText: "ONDO_MARKET_STATE_NOT_TRADABLE",
    }),
  ]);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.errorText, "40367 US hours");
});
