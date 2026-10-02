import assert from "node:assert/strict";
import test from "node:test";
import { checkEvmSubmission, commitEip712, commitEvmTx, type EvmCommitInput } from "@parallax/core";
import { privateKeyToAccount } from "viem/accounts";
import { assertSignedEvm, assertSignedRfq, decodeSignedEvm } from "./integrity";

const KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const OTHER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PASSPORT = "a".repeat(64);
const account = privateKeyToAccount(KEY);
const other = privateKeyToAccount(OTHER);
const TO = "0x1111111111111111111111111111111111111111" as const;

function fields(partial: Partial<EvmCommitInput> = {}): EvmCommitInput {
  return {
    passportHash: PASSPORT,
    chainId: 56,
    from: account.address,
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

async function sign(partial: Partial<EvmCommitInput> = {}) {
  const row = fields(partial);
  return account.signTransaction({
    chainId: Number(row.chainId),
    to: row.to as `0x${string}`,
    value: BigInt(row.value),
    data: row.data as `0x${string}`,
    nonce: Number(row.nonce),
    gas: BigInt(row.gasLimit || "0"),
    gasPrice: BigInt(row.gasPrice || "0"),
    type: "legacy",
  });
}

const typed = {
  domain: { name: "Ondo", version: "1", chainId: 56, verifyingContract: "0x0000000000000000000000000000000000000001" as const },
  types: { Order: [{ name: "maker", type: "address" }] },
  primaryType: "Order" as const,
  message: { maker: account.address },
};

test("a real signed transaction matches the execution payload commitment", async () => {
  const commitment = commitEvmTx(fields());
  const serialized = await sign();
  const decoded = await decodeSignedEvm(serialized);
  const verdict = checkEvmSubmission({
    commitment,
    passportHash: PASSPORT,
    tx: decoded,
    expectedSigner: account.address,
  });
  assert.equal(verdict.ok, true);
  await assertSignedEvm({
    signedTransaction: serialized,
    commitment,
    passportHash: PASSPORT,
    expectedSigner: account.address,
  });
});

test("signed calldata, recipient, amount, and chain changes are rejected", async () => {
  const commitment = commitEvmTx(fields());
  const cases = [
    await sign({ data: "0xbb" }),
    await sign({ to: "0x2222222222222222222222222222222222222222" }),
    await sign({ value: "2" }),
    await sign({ chainId: 1 }),
  ];
  for (const serialized of cases) {
    await assert.rejects(
      () =>
        assertSignedEvm({
          signedTransaction: serialized,
          commitment,
          passportHash: PASSPORT,
          expectedSigner: account.address,
        }),
      /does not match the signing commitment/,
    );
  }
});

test("RFQ signature over different typed data is rejected", async () => {
  const commitment = commitEip712({
    passportHash: PASSPORT,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const modified = { ...typed, message: { maker: "0x2222222222222222222222222222222222222222" as const } };
  const signature = await account.signTypedData(modified);
  await assert.rejects(
    () =>
      assertSignedRfq({
        signature,
        typedData: JSON.stringify(modified),
        commitment,
        passportHash: PASSPORT,
        expectedSigner: account.address,
      }),
    /typed data does not match/,
  );
});

test("RFQ signature from the wrong key is rejected", async () => {
  const commitment = commitEip712({
    passportHash: PASSPORT,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const signature = await other.signTypedData(typed);
  await assert.rejects(
    () =>
      assertSignedRfq({
        signature,
        typedData: JSON.stringify(typed),
        commitment,
        passportHash: PASSPORT,
        expectedSigner: account.address,
      }),
    /passport wallet/,
  );
});

test("a matching RFQ signature is accepted", async () => {
  const commitment = commitEip712({
    passportHash: PASSPORT,
    domain: typed.domain,
    types: typed.types,
    primaryType: typed.primaryType,
    message: typed.message,
  });
  const signature = await account.signTypedData(typed);
  await assertSignedRfq({
    signature,
    typedData: JSON.stringify(typed),
    commitment,
    passportHash: PASSPORT,
    expectedSigner: account.address,
    expiresAt: Date.now() + 10_000,
  });
});
