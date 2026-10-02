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

function hex(value: string): string {
  return value.trim().toLowerCase();
}

export function commitEvmTx(input: {
  passportHash: string;
  chainId?: number;
  from: string;
  to: string;
  value: string;
  data: string;
}): SigningCommitment {
  const body = {
    scheme: "EVM_TX" as const,
    chainId: input.chainId ?? CHAIN_ID,
    from: hex(input.from),
    to: hex(input.to),
    value: String(input.value || "0"),
    data: hex(input.data),
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
  if (row.step === "sign-swap" && row.tx && typeof row.tx === "object") {
    const tx = row.tx as { from?: string; to?: string; value?: string; data?: string };
    if (!tx.from || !tx.to || !tx.data) return null;
    return commitEvmTx({
      passportHash,
      chainId,
      from: tx.from,
      to: tx.to,
      value: tx.value || "0",
      data: tx.data,
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
