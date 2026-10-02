import assert from "node:assert/strict";
import test from "node:test";
import {
  commitAgenticSwap,
  commitEip712,
  commitEvmTx,
  commitFromPrepare,
} from "./commitment";
import { QUOTE_ASSETS } from "./registry";

const PASSPORT = "a".repeat(64);

test("EVM_TX hash is of the canonical tx, not the passport", () => {
  const a = commitEvmTx({
    passportHash: PASSPORT,
    from: "0xABCDEF0000000000000000000000000000000001",
    to: "0x1111111111111111111111111111111111111111",
    value: "0",
    data: "0xAa",
  });
  const b = commitEvmTx({
    passportHash: PASSPORT,
    from: "0xabcdef0000000000000000000000000000000001",
    to: "0x1111111111111111111111111111111111111111",
    value: "0",
    data: "0xaa",
  });
  assert.equal(a.scheme, "EVM_TX");
  assert.equal(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(a.hash.includes("aa"), false);
  assert.equal(a.canonical.includes("0xaa"), true);
  assert.equal(a.passportHash, PASSPORT);
});

test("different calldata produces a different commitment", () => {
  const a = commitEvmTx({
    passportHash: PASSPORT,
    from: "0xabcdef0000000000000000000000000000000001",
    to: "0x1111111111111111111111111111111111111111",
    value: "0",
    data: "0xaa",
  });
  const b = commitEvmTx({
    passportHash: PASSPORT,
    from: "0xabcdef0000000000000000000000000000000001",
    to: "0x1111111111111111111111111111111111111111",
    value: "0",
    data: "0xbb",
  });
  assert.notEqual(a.hash, b.hash);
});

test("EIP712_RFQ hashes domain types primaryType message", () => {
  const a = commitEip712({
    passportHash: PASSPORT,
    domain: { name: "Ondo", chainId: 56 },
    types: { Order: [{ name: "maker", type: "address" }] },
    primaryType: "Order",
    message: { maker: "0x1" },
  });
  assert.equal(a.scheme, "EIP712_RFQ");
  assert.equal(a.canonical.includes("primaryType"), true);
  assert.equal(JSON.parse(a.canonical).scheme, "EIP712_RFQ");
});

test("commitFromPrepare hashes a swap tx and drops calldata from the return shape", () => {
  const commitment = commitFromPrepare(PASSPORT, {
    step: "sign-swap",
    tx: {
      from: "0xABCDEF0000000000000000000000000000000001",
      to: "0x2222222222222222222222222222222222222222",
      value: "0",
      data: "0xdeadbeef",
    },
  });
  assert.ok(commitment);
  assert.equal(commitment?.scheme, "EVM_TX");
  assert.equal("data" in (commitment || {}), false);
  assert.equal(commitment?.canonical.includes("0xdeadbeef"), true);
});

test("commitFromPrepare hashes RFQ typed data", () => {
  const commitment = commitFromPrepare(
    PASSPORT,
    {
      step: "sign-rfq",
      typedData: JSON.stringify({
        domain: { name: "Ondo", chainId: 56 },
        types: { Order: [{ name: "maker", type: "address" }] },
        primaryType: "Order",
        message: { maker: "0x1" },
      }),
    },
  );
  assert.ok(commitment);
  assert.equal(commitment?.scheme, "EIP712_RFQ");
});

test("commitFromPrepare ignores approve", () => {
  assert.equal(
    commitFromPrepare(PASSPORT, {
      step: "approve",
      tx: { from: "0x1", to: "0x2", value: "0", data: "0xaa" },
    }),
    null,
  );
});

test("AGENTIC_MARKET hashes the baw swap, not an EVM tx", () => {
  const commitment = commitAgenticSwap({
    passportHash: PASSPORT,
    side: "buy",
    token: "0xC845B2894DbDdD03858fD2d643B4ef725FE0849d",
    usdt: "1",
  });
  assert.equal(commitment.scheme, "AGENTIC_MARKET");
  const body = JSON.parse(commitment.canonical) as { fromToken: string; toToken: string; fromQty: string };
  assert.equal(body.fromToken, QUOTE_ASSETS.USDT.address.toLowerCase());
  assert.equal(body.toToken, "0xc845b2894dbddd03858fd2d643b4ef725fe0849d");
  assert.equal(body.fromQty, "1");
});
