import {
  assertVerdict,
  checkEip712Submission,
  checkEvmSubmission,
  eip712Body,
  parseTypedData,
  type EvmCommitInput,
  type SigningCommitment,
} from "@parallax/core";
import {
  parseTransaction,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  verifyTypedData,
  type Hex,
} from "viem";

function hexTx(value: string): Hex {
  const text = value.trim();
  return (text.startsWith("0x") ? text : `0x${text}`) as Hex;
}

/** Decode a signed BSC transaction into the execution-payload fields. `from` is recovered from the signature. */
export async function decodeSignedEvm(serialized: string): Promise<Omit<EvmCommitInput, "passportHash">> {
  const raw = hexTx(serialized);
  const parsed = parseTransaction(raw);
  const from = await recoverTransactionAddress({ serializedTransaction: raw as never });
  if (!parsed.to) throw new Error("Signed transaction has no recipient.");
  return {
    chainId: parsed.chainId,
    from,
    to: parsed.to,
    value: (parsed.value ?? 0n).toString(10),
    data: parsed.data || "0x",
    nonce: (parsed.nonce ?? 0).toString(10),
    gasLimit: parsed.gas?.toString(10),
    gasPrice: parsed.gasPrice?.toString(10),
    maxFeePerGas: parsed.maxFeePerGas?.toString(10),
    maxPriorityFeePerGas: parsed.maxPriorityFeePerGas?.toString(10),
    transactionType: parsed.type,
  };
}

export async function assertSignedEvm(input: {
  signedTransaction: string;
  commitment: SigningCommitment;
  passportHash: string;
  expectedSigner: string;
  expiresAt?: number;
  now?: number;
}): Promise<void> {
  const tx = await decodeSignedEvm(input.signedTransaction);
  assertVerdict(
    checkEvmSubmission({
      commitment: input.commitment,
      passportHash: input.passportHash,
      tx,
      expectedSigner: input.expectedSigner,
      expiresAt: input.expiresAt,
      now: input.now,
    }),
  );
}

export async function assertSignedRfq(input: {
  signature: string;
  typedData?: string;
  commitment: SigningCommitment;
  passportHash: string;
  expectedSigner: string;
  expiresAt?: number;
  now?: number;
}): Promise<void> {
  const stored = eip712Body(input.commitment);
  const submitted = input.typedData ? parseTypedData(input.typedData) : null;
  const signature = hexTx(input.signature);
  let recovered: string | null = null;
  let signedStoredTypedData = false;
  try {
    const typed = {
      domain: stored.domain,
      types: stored.types,
      primaryType: stored.primaryType,
      message: stored.message,
      signature,
    };
    recovered = await recoverTypedDataAddress(typed as never);
    signedStoredTypedData = Boolean(
      await verifyTypedData({
        address: recovered as Hex,
        domain: stored.domain,
        types: stored.types,
        primaryType: stored.primaryType,
        message: stored.message,
        signature,
      } as never),
    );
  } catch {
    signedStoredTypedData = false;
  }
  assertVerdict(
    checkEip712Submission({
      commitment: input.commitment,
      passportHash: input.passportHash,
      expectedSigner: input.expectedSigner,
      recoveredSigner: recovered,
      signedStoredTypedData,
      submitted,
      expiresAt: input.expiresAt,
      now: input.now,
    }),
  );
}
