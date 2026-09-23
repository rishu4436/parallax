import { getAddress } from "viem";
import { web3Fetch } from "./client";

export interface EvmTx {
  from: string;
  to: string;
  value: string;
  data: string;
}

export async function simulateEvm(tx: EvmTx) {
  return web3Fetch("POST", "/api/v1/dex/pre-transaction/simulate", {
    body: {
      binanceChainId: "56",
      evmTx: {
        from: getAddress(tx.from),
        to: getAddress(tx.to),
        value: tx.value || "0",
        data: tx.data || "0x",
      },
    },
  });
}

export async function broadcastEvm(signedTransaction: string, address: string) {
  return web3Fetch("POST", "/api/v1/dex/pre-transaction/broadcast-transaction", {
    body: {
      binanceChainId: "56",
      signedTransaction,
      address: getAddress(address),
      enableMevProtection: false,
    },
  });
}

export async function getGasPrice() {
  return web3Fetch("GET", "/api/v1/dex/pre-transaction/gas-price", {
    query: { binanceChainId: "56" },
  });
}

export async function getBroadcastOrders(address: string, orderId?: string) {
  return web3Fetch("GET", "/api/v1/dex/post-transaction/orders", {
    query: { binanceChainId: "56", address: getAddress(address), orderId },
  });
}

export async function getTokenBalances(address: string, tokens: string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 20) chunks.push(tokens.slice(i, i + 20));
  const pages = [];
  for (const chunk of chunks) {
    const page = await web3Fetch("POST", "/api/v1/dex/balance/token-balances-by-address", {
      body: {
        address: getAddress(address),
        excludeRiskToken: "0",
        tokenContractAddresses: chunk.map((token) => ({
          binanceChainId: "56",
          tokenContractAddress: getAddress(token),
        })),
      },
    });
    pages.push(page.data);
  }
  return { data: pages, raw: pages, ms: 0 };
}
