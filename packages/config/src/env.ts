import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let loaded = false;

function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const root = repoRoot();
  for (const file of [path.join(root, ".env"), path.join(process.cwd(), ".env")]) {
    if (existsSync(file)) loadDotenv({ path: file });
  }
}

export type ParallaxEnv = {
  web3ApiKey: string;
  web3ApiSecret: string;
  web3ApiBase: string;
  chainId: number;
  bscRpc: string;
  orderCapUsdt: number;
  dailyCapUsdt: number;
  quoteWallet: `0x${string}`;
  agentId: string;
  x402Url: string;
  x402MinUsd: number;
  dataDir: string;
};

export function readEnv(): ParallaxEnv {
  loadEnv();
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || 56);
  if (chainId !== 56) {
    throw new Error(`PARALLAX is BSC mainnet only. Refusing chain id ${chainId}.`);
  }
  const quoteWallet = (process.env.QUOTE_WALLET ||
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045") as `0x${string}`;
  return {
    web3ApiKey: process.env.WEB3_API_KEY?.trim() || "",
    web3ApiSecret: process.env.WEB3_API_SECRET?.trim() || "",
    web3ApiBase: (process.env.WEB3_API_BASE || "https://web3.binance.com/build").replace(/\/$/, ""),
    chainId,
    bscRpc: process.env.NEXT_PUBLIC_BSC_RPC || process.env.BSC_RPC || "https://bsc-dataseed.binance.org",
    orderCapUsdt: Number(process.env.DEFAULT_ORDER_CAP_USDT || 25),
    dailyCapUsdt: Number(process.env.DEFAULT_DAILY_CAP_USDT || 100),
    quoteWallet,
    agentId: process.env.AGENT_ERC8004_ID?.trim() || "",
    x402Url: process.env.AGENT_X402_URL?.trim() || "",
    x402MinUsd: Number(process.env.AGENT_X402_MIN_USD || 1),
    dataDir: process.env.PARALLAX_DATA_DIR?.trim() || path.join(repoRoot(), ".data"),
  };
}
