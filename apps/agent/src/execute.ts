import { QUOTE_ASSETS, type Side } from "@parallax/core";
import { bawData, BawError, runBaw } from "./baw";

const USDT = QUOTE_ASSETS.USDT.address;

export function marketSwapArgs(input: { side: Side; usdt: string; token: `0x${string}`; tokenQty?: string }): { args: string[] } | { error: string } {
  if (input.side === "buy") {
    return {
      args: [
        "market-order",
        "swap",
        "--fromTokenQty",
        input.usdt,
        "--fromToken",
        USDT,
        "--toToken",
        input.token,
        "--binanceChainId",
        "56",
        "--slippage",
        "1",
      ],
    };
  }
  if (!input.tokenQty) return { error: "Sell needs a token amount. Price was missing, so this clip was not sent." };
  return {
    args: [
      "market-order",
      "swap",
      "--fromTokenQty",
      input.tokenQty,
      "--fromToken",
      input.token,
      "--toToken",
      USDT,
      "--binanceChainId",
      "56",
      "--slippage",
      "1",
    ],
  };
}

export function tokenQtyFromNotional(usdt: string, perShare: number | null | undefined): string | null {
  const amount = Number(usdt);
  if (!perShare || perShare <= 0 || !Number.isFinite(amount) || amount <= 0) return null;
  return (amount / perShare).toFixed(6);
}

export async function agentWallet(): Promise<`0x${string}` | null> {
  try {
    const status = bawData(await runBaw(["wallet", "status"]));
    if (status.status !== "CONNECTED") return null;
    const body = bawData(await runBaw(["wallet", "address"]));
    const rows = Array.isArray(body.addresses) ? body.addresses : [];
    const bsc = rows.find((row) => row && typeof row === "object" && (row as { binanceChainId?: string }).binanceChainId === "56") as
      | { address?: string }
      | undefined;
    const address = bsc?.address;
    if (!address || !address.startsWith("0x")) return null;
    return address as `0x${string}`;
  } catch {
    return null;
  }
}

export type SendResult = { note: string; done: boolean; pending: boolean; txHash?: string; orderId?: string };

export async function sendAgentSwap(input: { side: Side; usdt: string; token: `0x${string}`; tokenQty?: string }): Promise<SendResult> {
  const lock = bawData(await runBaw(["wallet", "tx-lock", "--binanceChainId", "56"]));
  if (lock.status === "LOCKED") {
    return { note: "Agentic Wallet is locked. Approve or wait in the Binance App.", done: false, pending: true };
  }
  const built = marketSwapArgs(input);
  if ("error" in built) return { note: built.error, done: false, pending: false };
  const submitted = bawData(await runBaw(built.args, 40_000));
  const orderId = String(submitted.orderId || "");
  if (!orderId) return { note: "Agentic Wallet accepted the request but returned no order id.", done: false, pending: true };
  const settled = await pollOrder(orderId);
  return { ...settled, orderId };
}

export async function pollOrder(orderId: string): Promise<SendResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 4_000));
    const body = bawData(await runBaw(["market-order", "list", "--orderId", orderId]));
    const list = Array.isArray(body.list) ? body.list : [];
    const row = (list[0] || {}) as { status?: string; txHash?: string | null };
    const status = String(row.status || "PENDING");
    if (status === "FINISHED") {
      return { note: `sent · baw:${orderId} · ${row.txHash || "no hash yet"}`, done: true, pending: false, txHash: row.txHash || undefined, orderId };
    }
    if (status === "FAILED") {
      return { note: `baw:${orderId} failed`, done: true, pending: false, orderId };
    }
  }
  return { note: `submitted · baw:${orderId} · still processing`, done: false, pending: true, orderId };
}

export function pendingOrderId(lastAction?: string): string | null {
  return lastAction?.match(/baw:(\d+)/)?.[1] || null;
}

export function isBawMiss(err: unknown): boolean {
  return err instanceof BawError;
}
