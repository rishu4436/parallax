import { getAddress } from "viem";
import { web3Fetch } from "./client";

export interface QuoteQuery {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  userWalletAddress: string;
  vendor?: string;
}

export interface SwapQuery extends QuoteQuery {
  quoteId: string;
  slippagePercent?: string;
  autoSlippage?: boolean;
}

function addr(value: string): string {
  if (value.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    return "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  }
  return getAddress(value);
}

export async function getQuote(query: QuoteQuery) {
  return web3Fetch("GET", "/api/v1/dex/aggregator/quote", {
    query: {
      binanceChainId: "56",
      fromTokenAddress: addr(query.fromTokenAddress),
      toTokenAddress: addr(query.toTokenAddress),
      amount: query.amount,
      userWalletAddress: addr(query.userWalletAddress),
      vendor: query.vendor,
    },
  });
}

export async function getSwap(query: SwapQuery) {
  return web3Fetch("GET", "/api/v1/dex/aggregator/swap", {
    query: {
      binanceChainId: "56",
      quoteId: query.quoteId,
      fromTokenAddress: addr(query.fromTokenAddress),
      toTokenAddress: addr(query.toTokenAddress),
      amount: query.amount,
      userWalletAddress: addr(query.userWalletAddress),
      slippagePercent: query.autoSlippage ? undefined : (query.slippagePercent ?? "0.5"),
      autoSlippage: query.autoSlippage ? "true" : undefined,
    },
  });
}

export async function getApprove(token: string, amount: string, vendor?: string) {
  return web3Fetch("GET", "/api/v1/dex/aggregator/approve-transaction", {
    query: {
      binanceChainId: "56",
      tokenContractAddress: addr(token),
      approveAmount: amount,
      vendor,
    },
  });
}

export async function submitRfq(body: {
  requestId: string;
  userSignature: string;
  vendor: string;
  quoteId: string;
  signingScheme?: string;
}) {
  return web3Fetch("POST", "/api/v1/dex/aggregator/order/submit", { body });
}

export async function getRfqOrder(orderId: string) {
  return web3Fetch("GET", `/api/v1/dex/aggregator/order/${encodeURIComponent(orderId)}`);
}

export async function getSwapHistory(txHash: string) {
  return web3Fetch("GET", "/api/v1/dex/aggregator/history", {
    query: { binanceChainId: "56", txHash },
  });
}
