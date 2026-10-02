import assert from "node:assert/strict";
import test from "node:test";
import {
  checkEip712Submission,
  checkEvmSubmission,
  commitAgenticSwap,
  commitEip712,
  commitEvmTx,
  commitFromPrepare,
  type EvmCommitInput,
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

test("commitFromPrepare hashes an approve tx the same way as a swap", () => {
  const commitment = commitFromPrepare(PASSPORT, {
    step: "approve",
    tx: { from: "0x1", to: "0x2", value: "0", data: "0xaa", gas: "21000" },
  });
  assert.equal(commitment?.scheme, "EVM_TX");
  assert.equal(JSON.parse(commitment?.canonical || "{}").gasLimit, "21000");
});

const FROM = "0xabcdef0000000000000000000000000000000001";
const TO = "0x1111111111111111111111111111111111111111";

function evm(partial: Partial<EvmCommitInput> = {}): EvmCommitInput {
  return {
    passportHash: PASSPORT,
    chainId: 56,
    from: FROM,
    to: TO,
    value: "1",
    data: "0xdeadbeef",
    nonce: "7",
    gasLimit: "21000",
    gasPrice: "1000000000",
    transactionType: "legacy",
    ...partial,
  };
}

test("nonce and fee fields change the execution payload hash", () => {
  const base = commitEvmTx(evm());
  assert.notEqual(base.hash, commitEvmTx(evm({ nonce: "8" })).hash);
  assert.notEqual(base.hash, commitEvmTx(evm({ gasPrice: "2" })).hash);
  assert.equal(JSON.parse(base.canonical).nonce, "7");
  assert.equal(JSON.parse(base.canonical).gasLimit, "21000");
});

test("matching execution payload is accepted", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({
    commitment,
    passportHash: PASSPORT,
    tx: evm(),
    expectedSigner: FROM,
    expiresAt: 10_000,
    now: 1_000,
  });
  assert.equal(verdict.ok, true);
});

test("modified calldata is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({ commitment, passportHash: PASSPORT, tx: evm({ data: "0xbb" }), expectedSigner: FROM });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "COMMITMENT_MISMATCH");
});

test("modified recipient is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({
    commitment,
    passportHash: PASSPORT,
    tx: evm({ to: "0x2222222222222222222222222222222222222222" }),
    expectedSigner: FROM,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "COMMITMENT_MISMATCH");
});

test("modified amount is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({ commitment, passportHash: PASSPORT, tx: evm({ value: "2" }), expectedSigner: FROM });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "COMMITMENT_MISMATCH");
});

test("modified chain is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({ commitment, passportHash: PASSPORT, tx: evm({ chainId: 1 }), expectedSigner: FROM });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "COMMITMENT_MISMATCH");
});

test("wrong signer is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({
    commitment,
    passportHash: PASSPORT,
    tx: evm({ from: "0x9999999999999999999999999999999999999999" }),
    expectedSigner: FROM,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "WRONG_SIGNER");
});

test("expired passport is rejected", () => {
  const commitment = commitEvmTx(evm());
  const verdict = checkEvmSubmission({
    commitment,
    passportHash: PASSPORT,
    tx: evm(),
    expectedSigner: FROM,
    expiresAt: 1_000,
    now: 1_000,
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "PASSPORT_EXPIRED");
});

test("wrong passport and commitment pair is rejected", () => {
  const commitment = commitEvmTx(evm({ passportHash: "b".repeat(64) }));
  const verdict = checkEvmSubmission({ commitment, passportHash: PASSPORT, tx: evm(), expectedSigner: FROM });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "WRONG_PAIR");
});

test("modified RFQ typed data is a different commitment", () => {
  const typed = {
    passportHash: PASSPORT,
    domain: { name: "Ondo", chainId: 56 },
    types: { Order: [{ name: "maker", type: "address" }] },
    primaryType: "Order",
    message: { maker: FROM },
  };
  const original = commitEip712(typed);
  const modified = commitEip712({ ...typed, message: { maker: "0x9999999999999999999999999999999999999999" } });
  assert.notEqual(original.hash, modified.hash);
  const verdict = checkEip712Submission({
    commitment: original,
    passportHash: PASSPORT,
    expectedSigner: FROM,
    recoveredSigner: FROM,
    signedStoredTypedData: true,
    submitted: {
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: { maker: "0x9999999999999999999999999999999999999999" },
    },
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "COMMITMENT_MISMATCH");
});

test("RFQ wrong signer is rejected", () => {
  const commitment = commitEip712({
    passportHash: PASSPORT,
    domain: { name: "Ondo", chainId: 56 },
    types: { Order: [{ name: "maker", type: "address" }] },
    primaryType: "Order",
    message: { maker: FROM },
  });
  const verdict = checkEip712Submission({
    commitment,
    passportHash: PASSPORT,
    expectedSigner: FROM,
    recoveredSigner: "0x9999999999999999999999999999999999999999",
    signedStoredTypedData: true,
    submitted: {
      domain: { name: "Ondo", chainId: 56 },
      types: { Order: [{ name: "maker", type: "address" }] },
      primaryType: "Order",
      message: { maker: FROM },
    },
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "WRONG_SIGNER");
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
