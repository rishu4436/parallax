import assert from "node:assert/strict";
import test from "node:test";
import { issueReceipt, receiptStatusFromSend, receiptStatusFromTape, updateReceipt } from "./receipt";

const PASSPORT = "b".repeat(64);
const COMMITMENT = "c".repeat(64);

test("receipt hash covers the durable audit body", () => {
  const receipt = issueReceipt({
    id: "r1",
    passportHash: PASSPORT,
    signingCommitmentHash: COMMITMENT,
    txHash: "0xabc",
    status: "submitted",
    source: "ui",
    submittedAt: 1_000,
  });
  assert.match(receipt.hash, /^[0-9a-f]{64}$/);
  assert.equal(receipt.passportHash, PASSPORT);
  assert.equal(receipt.signingCommitmentHash, COMMITMENT);
  assert.equal(receipt.actualOutput, null);
  assert.equal(receipt.realizedSlippageBps, null);
});

test("receiptStatusFromSend maps baw results", () => {
  assert.equal(receiptStatusFromSend({ note: "baw:1 failed", done: true, pending: false, orderId: "1" }), "failed");
  assert.equal(receiptStatusFromSend({ note: "sent · baw:1", done: true, pending: false, txHash: "0x1", orderId: "1" }), "filled");
  assert.equal(receiptStatusFromSend({ note: "still processing", done: false, pending: true, orderId: "1" }), "submitted");
  assert.equal(receiptStatusFromSend({ note: "Agentic Wallet is locked", done: false, pending: true }), "skipped");
});

test("receiptStatusFromTape maps desk tape statuses", () => {
  assert.equal(receiptStatusFromTape("filled"), "filled");
  assert.equal(receiptStatusFromTape("Failed EXPIRED"), "failed");
  assert.equal(receiptStatusFromTape("submitted"), "submitted");
  assert.equal(receiptStatusFromTape("approving"), null);
});

test("updateReceipt keeps id and passport hash", () => {
  const submitted = issueReceipt({
    id: "r1",
    passportHash: PASSPORT,
    signingCommitmentHash: COMMITMENT,
    status: "submitted",
    source: "strategy",
    submittedAt: 1_000,
    orderId: "9",
  });
  const filled = updateReceipt(submitted, { status: "filled", txHash: "0xabc", filledAt: 2_000 });
  assert.equal(filled.id, "r1");
  assert.equal(filled.passportHash, PASSPORT);
  assert.equal(filled.status, "filled");
  assert.equal(filled.txHash, "0xabc");
  assert.notEqual(filled.hash, submitted.hash);
});
