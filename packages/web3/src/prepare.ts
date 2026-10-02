import { getAddress } from "viem";
import {
  QUOTE_ASSETS,
  WALLET_MISMATCH,
  blockedBuildMessage,
  evaluatePolicy,
  needsSignerQuote,
  quoteStillYoung,
  signerMatchesQuote,
  sourceFromActor,
  type Intent,
  type PolicySource,
  type Settings,
  type VenueQuote,
} from "@parallax/core";
import { readAllowance } from "./balances";
import { quoteIntent } from "./book";
import { isWeb3Error } from "./client";
import { getApprove, getSwap } from "./trading";
import { simulateEvm } from "./transaction";

export interface UnsignedTx {
  from: string;
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxPriorityFeePerGas?: string;
}

export type PrepareResult =
  | { step: "rejected"; message: string }
  | { step: "expired"; message: string; quote?: VenueQuote }
  | { step: "approve"; quote: VenueQuote; tx: UnsignedTx; spender: string }
  | { step: "sign-rfq"; quote: VenueQuote; typedData: string; vendor: string; quoteId: string; signingScheme?: string; outAmount: string }
  | { step: "sign-swap"; quote: VenueQuote; tx: UnsignedTx; simulation: unknown; simulateStatus: "SUCCESS" | "FAILED"; simulateReason?: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function first(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return asRecord(value[0]);
  return asRecord(value);
}

async function requoteSameRail(intent: Intent, rail: VenueQuote["wrapper"]["rail"], vendor?: string): Promise<VenueQuote | null> {
  const book = await quoteIntent({ ...intent, railLock: rail, vendorLock: vendor }, { slip: false });
  const row = book.books.find((item) => item.wrapper.rail === rail);
  if (!row) return null;
  if (vendor) {
    const locked = row.routes.find((route) => route.ok && route.vendorName === vendor);
    if (locked) return locked;
  }
  return row.best ?? null;
}

export async function prepareExecution(input: {
  intent: Intent;
  settings: Settings;
  spentToday: number;
  quote: VenueQuote;
  source?: PolicySource;
  liquidity?: number;
  reference?: { price: number | null; label?: string };
}): Promise<PrepareResult> {
  const source = input.source ?? sourceFromActor(input.intent.actor);
  const preview = evaluatePolicy({
    source,
    mode: "preview",
    intent: { ...input.intent, railLock: input.quote.wrapper.rail },
    settings: input.settings,
    spentToday: input.spentToday,
    quote: input.quote,
    signer: input.intent.wallet,
    liquidity: input.liquidity,
    reference: input.reference,
  });
  const blocked = blockedBuildMessage(preview);
  if (blocked) return { step: "rejected", message: blocked };

  let quote = input.quote;
  const signerBound = needsSignerQuote(quote);
  const walletDrift = Boolean(quote.userWalletAddress) && !signerMatchesQuote(input.intent.wallet, quote.userWalletAddress);
  // RFQ rails (Ondo always, bStocks whenever the route can bind a wallet) drop the
  // display quoteId and re-quote atomically with the connected signer so /swap
  // still sees a live 30s TTL.
  if (signerBound || walletDrift || !quote.ok || !quote.quoteId || !quoteStillYoung(quote.quoteExpiresAt)) {
    const fresh = await requoteSameRail(input.intent, input.quote.wrapper.rail, input.intent.vendorLock || quote.vendorName);
    if (!fresh?.ok || !fresh.quoteId) {
      if (fresh?.errorCode === 40367 || fresh?.errorCode === 40369) {
        return { step: "rejected", message: fresh.errorText || `${fresh.errorCode} US hours` };
      }
      return {
        step: "expired",
        message: fresh?.errorText || "That price is 30 seconds old. Requote.",
        quote: fresh ?? undefined,
      };
    }
    if (needsSignerQuote(fresh) && !signerMatchesQuote(input.intent.wallet, fresh.userWalletAddress)) {
      return { step: "rejected", message: WALLET_MISMATCH };
    }
    quote = fresh;
  }

  const stable = QUOTE_ASSETS[input.intent.stable ?? "USDT"];
  const fromToken = input.intent.side === "buy" ? stable.address : quote.wrapper.address;
  const toToken = input.intent.side === "buy" ? quote.wrapper.address : stable.address;
  const amount = quote.inAmount;
  const sellToken = fromToken;

  if (quote.approveTarget && !sellToken.toLowerCase().includes("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")) {
    try {
      const allowance = await readAllowance(
        getAddress(sellToken),
        getAddress(input.intent.wallet),
        getAddress(quote.approveTarget),
      );
      if (allowance < BigInt(amount)) {
        const approved = await getApprove(
          sellToken,
          amount,
          quote.executionMode === "RFQ" ? quote.vendorName : undefined,
        );
        const row = first(approved.data);
        const data = String(row.data || "");
        if (!data) return { step: "rejected", message: "Approve endpoint returned no calldata." };
        return {
          step: "approve",
          quote,
          spender: String(row.dexContractAddress || quote.approveTarget),
          tx: {
            from: input.intent.wallet,
            to: sellToken,
            data,
            value: "0",
            gas: row.gasLimit ? String(row.gasLimit) : undefined,
            gasPrice: row.gasPrice ? String(row.gasPrice) : undefined,
          },
        };
      }
    } catch (err) {
      const message = isWeb3Error(err) ? `${err.code} ${err.message}` : err instanceof Error ? err.message : String(err);
      return { step: "rejected", message };
    }
  }

  if (!quote.quoteId) return { step: "expired", message: "That price is 30 seconds old. Requote.", quote };
  let swapRaw: { data: unknown };
  try {
    swapRaw = await getSwap({
      quoteId: quote.quoteId,
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount,
      userWalletAddress: input.intent.wallet,
      slippagePercent: "0.5",
    });
  } catch (err) {
    if (isWeb3Error(err) && err.code === 40401) {
      return { step: "expired", message: "40401 QUOTE_EXPIRED", quote };
    }
    const message = isWeb3Error(err) ? `${err.code} ${err.message}` : err instanceof Error ? err.message : String(err);
    return { step: "rejected", message };
  }

  const data = asRecord(swapRaw.data);
  const mode = String(data.executionMode || quote.executionMode || "");
  if (mode === "RFQ") {
    const rfq = asRecord(data.rfq);
    const typedData = String(rfq.typedDataToSign || "");
    const vendor = String(rfq.vendor || quote.vendorName || "");
    const quoteId = String(rfq.orderId || rfq.quoteId || quote.quoteId);
    if (!typedData || !vendor) return { step: "rejected", message: "RFQ swap returned no typed data." };
    return {
      step: "sign-rfq",
      quote,
      typedData,
      vendor,
      quoteId,
      signingScheme: rfq.signingScheme ? String(rfq.signingScheme) : undefined,
      outAmount: quote.outAmount,
    };
  }

  const tx = asRecord(data.tx);
  if (!tx.to || !tx.data) return { step: "rejected", message: "Swap returned no transaction." };
  const unsigned: UnsignedTx = {
    from: String(tx.from || input.intent.wallet),
    to: String(tx.to),
    data: String(tx.data),
    value: String(tx.value || "0"),
    gas: tx.gas ? String(tx.gas) : undefined,
    gasPrice: tx.gasPrice ? String(tx.gasPrice) : undefined,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? String(tx.maxPriorityFeePerGas) : undefined,
  };

  try {
    const sim = await simulateEvm({
      from: input.intent.wallet,
      to: unsigned.to,
      value: unsigned.value,
      data: unsigned.data,
    });
    const body = asRecord(sim.data);
    const status = String(body.status || "").toUpperCase();
    const ok = status === "SUCCESS" || status === "OK";
    return {
      step: "sign-swap",
      quote,
      tx: unsigned,
      simulation: sim.data,
      simulateStatus: ok ? "SUCCESS" : "FAILED",
      simulateReason: ok ? undefined : String(body.failReason || status || "Simulation failed"),
    };
  } catch (err) {
    const message = isWeb3Error(err) ? `${err.code} ${err.message}` : err instanceof Error ? err.message : String(err);
    return {
      step: "sign-swap",
      quote,
      tx: unsigned,
      simulation: isWeb3Error(err) ? err.body : { status: "FAILED", failReason: message },
      simulateStatus: "FAILED",
      simulateReason: message,
    };
  }
}

/** MCP / LLM view of prepare. Drops unsigned tx and RFQ typed data. */
export type PublicPrepare =
  | { step: "rejected"; message: string }
  | { step: "expired"; message: string; quote?: VenueQuote }
  | { step: "approve"; quote: VenueQuote; spender: string }
  | { step: "sign-rfq"; quote: VenueQuote; vendor: string; quoteId: string; signingScheme?: string; outAmount: string }
  | { step: "sign-swap"; quote: VenueQuote; simulateStatus: "SUCCESS" | "FAILED"; simulateReason?: string };

export function publicPrepare(result: PrepareResult): PublicPrepare {
  if (result.step === "rejected" || result.step === "expired") return result;
  if (result.step === "approve") return { step: "approve", quote: result.quote, spender: result.spender };
  if (result.step === "sign-rfq") {
    return {
      step: "sign-rfq",
      quote: result.quote,
      vendor: result.vendor,
      quoteId: result.quoteId,
      signingScheme: result.signingScheme,
      outAmount: result.outAmount,
    };
  }
  return {
    step: "sign-swap",
    quote: result.quote,
    simulateStatus: result.simulateStatus,
    simulateReason: result.simulateReason,
  };
}
