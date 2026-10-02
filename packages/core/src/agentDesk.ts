import type { AgentFill, ArmedStrategy, Job, TapeRow } from "./types";

export type WorkerPhase = "RUNNING" | "STOPPED" | "ARMED" | "UNKNOWN";
export type McpAccess = "READ" | "ANALYZE" | "PREPARE";

export interface McpTool {
  name: string;
  access: McpAccess;
  summary: string;
  signs: false;
}

/** Matches apps/mcp tool registration. None of these tools sign or broadcast. */
export const MCP_TOOLS: McpTool[] = [
  { name: "parallax_resolve", access: "READ", summary: "Map a name, ticker, or wrapper symbol to BSC rails.", signs: false },
  { name: "parallax_quote", access: "PREPARE", summary: "Live Binance quote and a Passport preview. Does not sign.", signs: false },
  { name: "parallax_best", access: "READ", summary: "Best open rail for a ticker. Does not sign.", signs: false },
  { name: "parallax_simulate", access: "PREPARE", summary: "Build and simulate a locked rail. Does not sign or broadcast.", signs: false },
  { name: "parallax_passport", access: "READ", summary: "Read an Execution Passport already stored by the desk.", signs: false },
  { name: "parallax_policy", access: "ANALYZE", summary: "Run PolicyEngine on a proposal. Does not sign.", signs: false },
  { name: "parallax_advise", access: "ANALYZE", summary: "Desk advice from live signals. Does not sign.", signs: false },
  { name: "parallax_status", access: "READ", summary: "Read the tape.", signs: false },
  { name: "parallax_portfolio", access: "READ", summary: "On-chain balances for a BSC wallet.", signs: false },
  { name: "parallax_weekend_brief", access: "READ", summary: "Session, Friday reference, and brief lines.", signs: false },
];

export const AGENT_CAN = [
  "Discover live quotes, reference prices, session state, and rail availability.",
  "Analyze gaps, compare wrappers, and explain an opportunity from the live book.",
  "Simulate and prepare through the existing quote and prepare path.",
  "Execute within configured policy through the Binance Agentic Wallet.",
] as const;

export const AGENT_CANNOT = [
  "Change policy or raise the order or daily cap.",
  "Disable the kill switch.",
  "Silently change rail or vendor.",
  "Sign an arbitrary user transaction.",
  "Bypass simulation, the Execution Passport, or the signing commitment.",
] as const;

export const BNB_STACK = [
  { name: "BNB Chain", use: "BSC mainnet, chain 56, is the only execution network." },
  { name: "Binance RWA APIs", use: "Reference and cash-session prints for the underlying." },
  { name: "Binance Market APIs", use: "Tokenized prices and market prints." },
  { name: "Binance Trading APIs", use: "Live executable quotes for bStocks, Ondo, and xStocks." },
  { name: "Binance Transaction APIs", use: "Simulation and transaction preparation before a signature." },
  { name: "Binance Agentic Wallet", use: "Policy-bound agent market orders. The wallet signs. The model does not." },
  { name: "BNB Agent Studio", use: "Agent runtime with A2A, MCP, and B402/X402 faces. The desk only reports a live ping." },
  { name: "MCP", use: "Read, analyze, and prepare tools. The MCP server does not sign." },
  { name: "A2A", use: "Agent Studio's agent-to-agent face. Parallax does not sign inside that chat." },
  { name: "B402 / X402", use: "Commerce and payment interface on the Studio agent. A 402 response blocks an agent clip." },
] as const;

export function workerPhase(input: { beat: "live" | "stopped" | null; armedUnpaused: number }): WorkerPhase {
  if (input.beat == null) return "UNKNOWN";
  if (input.beat !== "live") return "STOPPED";
  if (input.armedUnpaused > 0) return "ARMED";
  return "RUNNING";
}

export function agentsLayout(width: number): "stack" | "workspace" {
  return width >= 900 ? "workspace" : "stack";
}

export interface StrategyRow {
  id: string;
  name: string;
  ticker: string;
  condition: string;
  size: string;
  state: "armed" | "paused";
  lastAction: string;
  lastAt: number | null;
}

export function strategyRows(armed: ArmedStrategy[], jobs: Job[]): StrategyRow[] {
  const fromArmed = armed.map((row) => ({
    id: row.id,
    name: row.name,
    ticker: row.assetPairs.join(" "),
    condition: row.type === "CORRELATION" ? `ratio ${row.targetPortfolioRatio ?? "—"}` : `spread ${row.targetSpread}%`,
    size: `${row.usdt} USDT`,
    state: row.paused ? ("paused" as const) : ("armed" as const),
    lastAction: row.lastAction || "—",
    lastAt: row.lastAt ?? null,
  }));
  const fromJobs = jobs.map((job) => {
    const spec = job.spec as { ticker?: string; tickers?: string[]; usdt?: string; usdtEach?: string; maxUsdt?: string };
    const ticker = spec.ticker || spec.tickers?.join(" ") || "—";
    const size = spec.usdt || spec.usdtEach || spec.maxUsdt;
    return {
      id: job.id,
      name: job.name,
      ticker,
      condition: job.cadence || job.type,
      size: size ? `${size} USDT` : "—",
      state: job.paused ? ("paused" as const) : ("armed" as const),
      lastAction: job.lastAction || "—",
      lastAt: job.lastAt ?? null,
    };
  });
  return [...fromArmed, ...fromJobs];
}

export interface AgentActivityView {
  id: string;
  at: number;
  ticker: string;
  title: string;
  detail: string;
  demo: boolean;
  passportHash?: string;
  receiptId?: string;
  txHash?: string;
  status: string;
}

export function describeFill(fill: AgentFill): AgentActivityView {
  return {
    id: fill.id,
    at: fill.at,
    ticker: fill.ticker,
    title: `${fill.strategyType} ${fill.side} ${fill.usdt} USDT ${fill.ticker}`,
    detail: fill.note,
    demo: false,
    passportHash: fill.passportHash,
    receiptId: fill.receiptId,
    txHash: fill.txHash,
    status: fill.status,
  };
}

export function partitionActivity<T extends { demo?: boolean }>(rows: T[]): { live: T[]; demo: T[] } {
  return {
    live: rows.filter((row) => !row.demo),
    demo: rows.filter((row) => row.demo),
  };
}

export function agentReceipts(fills: AgentFill[], tape: TapeRow[]): Array<{
  id: string;
  at: number;
  ticker: string;
  rail: string;
  status: string;
  passportHash?: string;
  commitment?: string;
  txOrOrder?: string;
  slippage: string;
}> {
  const fromFills = fills.map((fill) => ({
    id: fill.receiptId || fill.id,
    at: fill.at,
    ticker: fill.ticker,
    rail: fill.strategyType,
    status: fill.status === "filled" ? "FILLED" : fill.status === "failed" ? "FAILED" : "SKIPPED",
    passportHash: fill.passportHash,
    commitment: fill.signingCommitmentHash,
    txOrOrder: fill.txHash || fill.receiptId,
    slippage: fill.spreadPct == null ? "—" : `${fill.spreadPct.toFixed(2)}%`,
  }));
  const seen = new Set(fromFills.map((row) => row.id));
  const fromTape = tape
    .filter((row) => row.source === "agent" && !seen.has(row.receiptId || row.id))
    .map((row) => ({
      id: row.receiptId || row.id,
      at: row.at,
      ticker: row.ticker,
      rail: row.rail,
      status: row.status.toUpperCase(),
      passportHash: row.passportHash,
      commitment: row.signingCommitmentHash,
      txOrOrder: row.txHash || row.orderId,
      slippage: "—",
    }));
  return [...fromFills, ...fromTape].sort((a, b) => b.at - a.at);
}
