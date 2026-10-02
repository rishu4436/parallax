import assert from "node:assert/strict";
import test from "node:test";
import { issuePassport } from "./passport";
import { ExecutionStore, PassportStore, resetStoreBackend, storeInfo } from "./persist";
import { commitEvmTx } from "./commitment";
import { issueReceipt } from "./receipt";
import type { Intent, Settings, VenueQuote, Wrapper } from "./types";
import { QUOTE_TTL_MS } from "./types";

function wrapper(): Wrapper {
  return {
    rail: "xStock",
    type: 2,
    symbol: "NVDAx",
    address: "0xC845B2894DbDdD03858fD2d643B4ef725FE0849d",
    decimals: 18,
    multiplier: 1,
  };
}

function quote(): VenueQuote {
  return {
    wrapper: wrapper(),
    ok: true,
    executionMode: "SWAP",
    vendorName: "LiquidMesh",
    quoteId: "q-store",
    quoteExpiresAt: 1_000 + QUOTE_TTL_MS,
    inAmount: "1",
    outAmount: "1",
    mid: 102,
    perShare: 102,
    slipBps50: 10,
    slipBps500: 40,
    slipKnown: true,
    gasUsd: 0,
    raw: {},
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
  wallet: "0xabcdef0000000000000000000000000000000001",
  actor: "user",
};

function withMemory<T>(fn: () => T): T {
  const prevStore = process.env.PARALLAX_STORE;
  const prevVercel = process.env.VERCEL;
  process.env.PARALLAX_STORE = "memory";
  delete process.env.VERCEL;
  resetStoreBackend();
  try {
    return fn();
  } finally {
    if (prevStore == null) delete process.env.PARALLAX_STORE;
    else process.env.PARALLAX_STORE = prevStore;
    if (prevVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    resetStoreBackend();
  }
}

test("PARALLAX_STORE=memory is not durable", () => {
  withMemory(() => {
    assert.deepEqual(storeInfo(), { kind: "memory", durable: false });
  });
});

test("VERCEL selects the deployed memory backend", () => {
  const prevStore = process.env.PARALLAX_STORE;
  const prevVercel = process.env.VERCEL;
  try {
    delete process.env.PARALLAX_STORE;
    process.env.VERCEL = "1";
    resetStoreBackend();
    assert.deepEqual(storeInfo(), { kind: "memory", durable: false });
  } finally {
    if (prevStore == null) delete process.env.PARALLAX_STORE;
    else process.env.PARALLAX_STORE = prevStore;
    if (prevVercel == null) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    resetStoreBackend();
  }
});

test("PassportStore and ExecutionStore round-trip in memory", () => {
  withMemory(() => {
    const passport = issuePassport({
      intent,
      quote: quote(),
      underlying: { ticker: "NVDA", name: "NVIDIA" },
      reference: { price: 100, label: "prior cash close" },
      settings,
      spentToday: 0,
      now: 1_000,
    });
    PassportStore.write({ ...passport, commitment: commitEvmTx({ passportHash: passport.hash, from: "0x1", to: "0x2", value: "0", data: "0xaa" }) });
    const stored = PassportStore.find(passport.hash);
    assert.ok(stored);
    assert.equal(stored?.hash, passport.hash);
    assert.equal(stored?.commitment, undefined);

    const commitment = commitEvmTx({
      passportHash: passport.hash,
      from: "0xABCDEF0000000000000000000000000000000001",
      to: "0x1111111111111111111111111111111111111111",
      value: "0",
      data: "0xaa",
    });
    ExecutionStore.writeCommitment(commitment);
    const receipt = issueReceipt({
      id: "r-store",
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      status: "submitted",
      source: "ui",
      submittedAt: 1_000,
    });
    ExecutionStore.writeReceipt(receipt);
    const found = PassportStore.find(passport.hash);
    assert.equal(found?.commitment?.hash, commitment.hash);
    assert.equal(found?.receipt?.id, "r-store");
  });
});
