import { createPublicClient, formatUnits, http, type Address } from "viem";
import { bsc } from "viem/chains";
import { QUOTE_ASSETS, listUnderlyings, type Wrapper } from "@parallax/core";
import { readEnv } from "@parallax/config";
import { isWeb3Error } from "./client";
import { getTokenBalances } from "./transaction";

const erc20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface BalanceLine {
  symbol: string;
  address: Address;
  rail?: Wrapper["rail"];
  ticker?: string;
  decimals: number;
  amount: number;
  raw: string;
}

export interface BalanceReport {
  lines: BalanceLine[];
  bnb: number;
  walletApiError?: string;
}

export async function readBalances(wallet: Address): Promise<BalanceReport> {
  const env = readEnv();
  const client = createPublicClient({ chain: bsc, transport: http(env.bscRpc) });
  const wrappers = listUnderlyings().flatMap((u) =>
    Object.values(u.wrappers)
      .filter((w): w is Wrapper => Boolean(w))
      .map((w) => ({ ...w, ticker: u.ticker })),
  );
  const stables = [QUOTE_ASSETS.USDT, QUOTE_ASSETS.USDC, QUOTE_ASSETS.USD1];
  const contracts = [
    ...wrappers.map((w) => ({ address: w.address, abi: erc20, functionName: "balanceOf" as const, args: [wallet] as const })),
    ...stables.map((s) => ({ address: s.address, abi: erc20, functionName: "balanceOf" as const, args: [wallet] as const })),
  ];
  const [bnb, results] = await Promise.all([
    client.getBalance({ address: wallet }),
    client.multicall({ contracts, allowFailure: true }),
  ]);
  const lines: BalanceLine[] = [];
  wrappers.forEach((w, i) => {
    const cell = results[i];
    const raw = cell.status === "success" ? (cell.result as bigint) : 0n;
    lines.push({
      symbol: w.symbol,
      address: w.address,
      rail: w.rail,
      ticker: w.ticker,
      decimals: w.decimals,
      amount: Number(formatUnits(raw, w.decimals)),
      raw: raw.toString(),
    });
  });
  stables.forEach((s, i) => {
    const cell = results[wrappers.length + i];
    const raw = cell.status === "success" ? (cell.result as bigint) : 0n;
    lines.push({
      symbol: s.symbol,
      address: s.address,
      decimals: s.decimals,
      amount: Number(formatUnits(raw, s.decimals)),
      raw: raw.toString(),
    });
  });
  let walletApiError: string | undefined;
  try {
    await getTokenBalances(wallet, [...wrappers.map((w) => w.address), ...stables.map((s) => s.address)].slice(0, 20));
  } catch (err) {
    walletApiError = isWeb3Error(err) ? `${err.code} ${err.message}` : err instanceof Error ? err.message : String(err);
  }
  return { lines, bnb: Number(formatUnits(bnb, 18)), walletApiError };
}

export async function readAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
  const env = readEnv();
  const client = createPublicClient({ chain: bsc, transport: http(env.bscRpc) });
  return client.readContract({
    address: token,
    abi: [
      {
        type: "function",
        name: "allowance",
        stateMutability: "view",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ type: "uint256" }],
      },
    ] as const,
    functionName: "allowance",
    args: [owner, spender],
  });
}
