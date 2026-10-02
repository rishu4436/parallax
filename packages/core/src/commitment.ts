import { canonicalHash, canonicalJson } from "./canonical";
import { QUOTE_ASSETS } from "./registry";
import { parseTypedData } from "./typed";
import type { Side } from "./types";

export const SIGNING_SCHEMES = ["EVM_TX", "EIP712_RFQ", "AGENTIC_MARKET"] as const;
export type SigningScheme = (typeof SIGNING_SCHEMES)[number];

export interface SigningCommitment {
  scheme: SigningScheme;
  hash: string;
  canonical: string;
  passportHash: string;
}

const CHAIN_ID = 56;

export const COMMITMENT_REJECTS = [
  "PASSPORT_MISSING",
  "PASSPORT_EXPIRED",
  "COMMITMENT_MISSING",
  "WRONG_PAIR",
  "WRONG_SCHEME",
  "WRONG_SIGNER",
  "COMMITMENT_MISMATCH",
] as const;
export type CommitmentRejectCode = (typeof COMMITMENT_REJECTS)[number];

export class CommitmentError extends Error {
  code: CommitmentRejectCode;
  constructor(code: CommitmentRejectCode, message: string) {
    super(message);
    this.code = code;
    this.name = "CommitmentError";
  }
}

export type CommitmentVerdict = { ok: true } | { ok: false; code: CommitmentRejectCode; message: string };

export interface EvmCommitInput {
  passportHash: string;
  chainId?: number;
  from: string;
  to: string;
  value: string;
  data: string;
  nonce?: string | number | null;
  gasLimit?: string | number | null;
  gasPrice?: string | number | null;
  maxFeePerGas?: string | number | null;
  maxPriorityFeePerGas?: string | number | null;
  transactionType?: string | number | null;
}

function hex(value: string): string {
  return value.trim().toLowerCase();
}

function quantity(value: string | number | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  try {
    if (text.startsWith("0x") || text.startsWith("0X")) return BigInt(text).toString(10);
    if (/^\d+$/.test(text)) return BigInt(text).toString(10);
  } catch {
    return undefined;
  }
  return text;
}

function reject(code: CommitmentRejectCode, message: string): CommitmentVerdict {
  return { ok: false, code, message };
}

/**
 * Execution-payload commitment. Hashes the fields Parallax asked the wallet to sign.
 * Optional nonce and fee fields are included only when they are known.
 * This is not a hash of the full serialized signed transaction.
 */
export function commitEvmTx(input: EvmCommitInput): SigningCommitment {
  const body = {
    scheme: "EVM_TX" as const,
    chainId: input.chainId ?? CHAIN_ID,
    from: hex(input.from),
    to: hex(input.to),
    value: quantity(input.value) || "0",
    data: hex(input.data || "0x"),
    ...(quantity(input.nonce) != null ? { nonce: quantity(input.nonce) } : {}),
    ...(quantity(input.gasLimit) != null ? { gasLimit: quantity(input.gasLimit) } : {}),
    ...(quantity(input.gasPrice) != null ? { gasPrice: quantity(input.gasPrice) } : {}),
    ...(quantity(input.maxFeePerGas) != null ? { maxFeePerGas: quantity(input.maxFeePerGas) } : {}),
    ...(quantity(input.maxPriorityFeePerGas) != null ? { maxPriorityFeePerGas: quantity(input.maxPriorityFeePerGas) } : {}),
    ...(input.transactionType != null && input.transactionType !== "" ? { transactionType: String(input.transactionType) } : {}),
  };
  const canonical = canonicalJson(body);
  return { scheme: "EVM_TX", hash: canonicalHash(body), canonical, passportHash: input.passportHash };
}

export function commitEip712(input: {
  passportHash: string;
  domain: unknown;
  types: unknown;
  primaryType: string;
  message: unknown;
}): SigningCommitment {
  const body = {
    scheme: "EIP712_RFQ" as const,
    domain: input.domain,
    types: input.types,
    primaryType: input.primaryType,
    message: input.message,
  };
  const canonical = canonicalJson(body);
  return { scheme: "EIP712_RFQ", hash: canonicalHash(body), canonical, passportHash: input.passportHash };
}

export function commitAgenticMarket(input: {
  passportHash: string;
  chainId?: number;
  side: Side;
  fromToken: string;
  toToken: string;
  fromQty: string;
  slippage?: string;
}): SigningCommitment {
  const body = {
    scheme: "AGENTIC_MARKET" as const,
    chainId: input.chainId ?? CHAIN_ID,
    side: input.side,
    fromToken: hex(input.fromToken),
    toToken: hex(input.toToken),
    fromQty: String(input.fromQty),
    slippage: input.slippage || "1",
  };
  const canonical = canonicalJson(body);
  return { scheme: "AGENTIC_MARKET", hash: canonicalHash(body), canonical, passportHash: input.passportHash };
}

/** Hash the baw market-order that will be sent. Calldata stays off the Passport. */
export function commitAgenticSwap(input: {
  passportHash: string;
  side: Side;
  token: string;
  usdt: string;
  tokenQty?: string;
  slippage?: string;
}): SigningCommitment {
  const usdt = QUOTE_ASSETS.USDT.address;
  const buy = input.side === "buy";
  return commitAgenticMarket({
    passportHash: input.passportHash,
    side: input.side,
    fromToken: buy ? usdt : input.token,
    toToken: buy ? input.token : usdt,
    fromQty: buy ? input.usdt : input.tokenQty || input.usdt,
    slippage: input.slippage,
  });
}

/** Hash the payload that will be signed. Calldata and typed data stay off the Passport. */
export function commitFromPrepare(passportHash: string, prepare: unknown, chainId = CHAIN_ID): SigningCommitment | null {
  if (!prepare || typeof prepare !== "object") return null;
  const row = prepare as Record<string, unknown>;
  if ((row.step === "sign-swap" || row.step === "approve") && row.tx && typeof row.tx === "object") {
    const tx = row.tx as EvmCommitInput & { gas?: string; type?: string };
    if (!tx.from || !tx.to || !tx.data) return null;
    return commitEvmTx({
      passportHash,
      chainId,
      from: tx.from,
      to: tx.to,
      value: tx.value || "0",
      data: tx.data,
      nonce: tx.nonce,
      gasLimit: tx.gasLimit || tx.gas,
      gasPrice: tx.gasPrice,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
      transactionType: tx.transactionType || tx.type,
    });
  }
  if (row.step === "sign-rfq" && typeof row.typedData === "string") {
    const typed = parseTypedData(row.typedData);
    return commitEip712({
      passportHash,
      domain: typed.domain,
      types: typed.types,
      primaryType: typed.primaryType,
      message: typed.message,
    });
  }
  return null;
}

function storedBody(commitment: SigningCommitment): Record<string, unknown> {
  return JSON.parse(commitment.canonical) as Record<string, unknown>;
}

function gate(input: { commitment: SigningCommitment; passportHash: string; expiresAt?: number; now?: number; scheme: SigningScheme }): CommitmentVerdict | null {
  if (input.commitment.passportHash !== input.passportHash) {
    return reject("WRONG_PAIR", "Signing commitment is bound to a different passport.");
  }
  if (input.commitment.scheme !== input.scheme) {
    return reject("WRONG_SCHEME", `Signing commitment is ${input.commitment.scheme}.`);
  }
  if (input.expiresAt != null && (input.now ?? Date.now()) >= input.expiresAt) {
    return reject("PASSPORT_EXPIRED", "That price is 30 seconds old. Requote.");
  }
  return null;
}

/**
 * Recompute the execution-payload hash from a decoded transaction.
 * Optional nonce and fee fields are compared only when the stored commitment included them.
 */
export function checkEvmSubmission(input: {
  commitment: SigningCommitment;
  passportHash: string;
  tx: Omit<EvmCommitInput, "passportHash">;
  expectedSigner?: string;
  expiresAt?: number;
  now?: number;
}): CommitmentVerdict {
  const blocked = gate({ ...input, scheme: "EVM_TX" });
  if (blocked) return blocked;
  if (input.expectedSigner && hex(input.tx.from) !== hex(input.expectedSigner)) {
    return reject("WRONG_SIGNER", "Recovered signer does not match the passport wallet.");
  }
  const stored = storedBody(input.commitment);
  const recomputed = commitEvmTx({
    passportHash: input.passportHash,
    chainId: input.tx.chainId,
    from: input.tx.from,
    to: input.tx.to,
    value: input.tx.value,
    data: input.tx.data,
    nonce: "nonce" in stored ? input.tx.nonce : undefined,
    gasLimit: "gasLimit" in stored ? input.tx.gasLimit : undefined,
    gasPrice: "gasPrice" in stored ? input.tx.gasPrice : undefined,
    maxFeePerGas: "maxFeePerGas" in stored ? input.tx.maxFeePerGas : undefined,
    maxPriorityFeePerGas: "maxPriorityFeePerGas" in stored ? input.tx.maxPriorityFeePerGas : undefined,
    transactionType: "transactionType" in stored ? input.tx.transactionType : undefined,
  });
  if (recomputed.hash !== input.commitment.hash) {
    return reject("COMMITMENT_MISMATCH", "Signed transaction does not match the signing commitment.");
  }
  return { ok: true };
}

export function eip712Body(commitment: SigningCommitment): {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
} {
  const body = storedBody(commitment);
  return {
    domain: (body.domain || {}) as Record<string, unknown>,
    types: (body.types || {}) as Record<string, unknown>,
    primaryType: String(body.primaryType || ""),
    message: (body.message || {}) as Record<string, unknown>,
  };
}

/**
 * Signature was recovered against the stored typed data.
 * `signedStoredTypedData` is false when that signature is not valid for the committed EIP-712 hash.
 */
export function checkEip712Submission(input: {
  commitment: SigningCommitment;
  passportHash: string;
  expectedSigner: string;
  recoveredSigner?: string | null;
  signedStoredTypedData: boolean;
  submitted?: { domain: unknown; types: unknown; primaryType: string; message: unknown } | null;
  expiresAt?: number;
  now?: number;
}): CommitmentVerdict {
  const blocked = gate({ ...input, scheme: "EIP712_RFQ" });
  if (blocked) return blocked;
  if (!input.submitted) {
    return reject("COMMITMENT_MISMATCH", "RFQ submit did not include the committed typed data.");
  }
  const recomputed = commitEip712({
    passportHash: input.passportHash,
    domain: input.submitted.domain,
    types: input.submitted.types,
    primaryType: input.submitted.primaryType,
    message: input.submitted.message,
  });
  if (recomputed.hash !== input.commitment.hash) {
    return reject("COMMITMENT_MISMATCH", "Submitted typed data does not match the signing commitment.");
  }
  if (!input.signedStoredTypedData) {
    return reject("COMMITMENT_MISMATCH", "Signature does not match the committed typed data.");
  }
  if (!input.recoveredSigner || hex(input.recoveredSigner) !== hex(input.expectedSigner)) {
    return reject("WRONG_SIGNER", "Recovered signer does not match the passport wallet.");
  }
  return { ok: true };
}

export function assertVerdict(verdict: CommitmentVerdict): void {
  if (!verdict.ok) throw new CommitmentError(verdict.code, verdict.message);
}
