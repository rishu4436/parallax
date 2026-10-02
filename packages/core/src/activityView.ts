import type { SigningCommitment, SigningScheme } from "./commitment";
import type { ExecutionPassport } from "./passport";
import type { ExecutionReceipt } from "./receipt";
import type { AgentFill, Rail, TapeRow } from "./types";

export type ActivitySource = "USER" | "AGENT" | "STRATEGY" | "MCP" | "STUDIO" | "UNKNOWN";
export type ActivityLens = "all" | "user" | "agent" | "strategy";
export type ActivityWindow = "today" | "7d" | "all";

export interface ActivityEvent {
  id: string;
  at: number;
  ticker: string;
  side: string;
  notional: string;
  rail: string;
  symbol: string;
  status: string;
  source: ActivitySource;
  vendor?: string;
  passportHash?: string;
  commitmentHash?: string;
  receiptHash?: string;
  receiptId?: string;
  txHash?: string;
  orderId?: string;
}

export interface ReplayStep {
  label: string;
  at: number | null;
}

export interface CommitmentFacts {
  scheme: SigningScheme | null;
  hash: string | null;
  pair: "MATCHED" | "MISMATCH" | "MISSING";
  evm: {
    chainId: string | null;
    from: string | null;
    to: string | null;
    value: string | null;
    selector: string | null;
    nonce: string | null;
    gasLimit: string | null;
    gasPrice: string | null;
    maxFeePerGas: string | null;
    maxPriorityFeePerGas: string | null;
    transactionType: string | null;
  } | null;
  rfq: { domain: string | null; chainId: string | null; primaryType: string | null } | null;
  agentic: { side: string | null; fromToken: string | null; toToken: string | null; fromQty: string | null } | null;
}

const DAY = 86_400_000;

function sourceFromReceipt(source: ExecutionReceipt["source"]): ActivitySource {
  if (source === "ui") return "USER";
  if (source === "agentic") return "AGENT";
  if (source === "strategy") return "STRATEGY";
  if (source === "mcp") return "MCP";
  if (source === "studio") return "STUDIO";
  return "UNKNOWN";
}

function sourceFromTape(source: TapeRow["source"], fill: boolean): ActivitySource {
  if (fill) return "AGENT";
  if (source === "agent") return "AGENT";
  if (source === "user") return "USER";
  return "UNKNOWN";
}

export function activityEvents(input: {
  tape?: TapeRow[];
  fills?: AgentFill[];
  receipts?: ExecutionReceipt[];
  passports?: ExecutionPassport[];
}): ActivityEvent[] {
  const tape = input.tape || [];
  const fills = input.fills || [];
  const receipts = input.receipts || [];
  const passports = new Map((input.passports || []).map((row) => [row.hash, row]));
  const usedTape = new Set<string>();
  const usedFills = new Set<string>();
  const events: ActivityEvent[] = [];

  for (const receipt of receipts) {
    const row = tape.find((item) => item.passportHash === receipt.passportHash || item.receiptId === receipt.id);
    const fill = fills.find((item) => item.passportHash === receipt.passportHash || item.receiptId === receipt.id);
    if (row) usedTape.add(row.id);
    if (fill) usedFills.add(fill.id);
    const passport = passports.get(receipt.passportHash);
    events.push({
      id: receipt.id,
      at: receipt.submittedAt,
      ticker: row?.ticker || fill?.ticker || passport?.body.intent.ticker || "—",
      side: row?.side || fill?.side || passport?.body.intent.side || "—",
      notional: row?.usd || fill?.usdt || passport?.body.intent.usdt || "—",
      rail: row?.rail || passport?.body.representation.rail || "—",
      symbol: row?.symbol || passport?.body.representation.symbol || "—",
      status: receipt.status.toUpperCase(),
      source: sourceFromReceipt(receipt.source),
      vendor: row?.vendorName || passport?.body.vendor || undefined,
      passportHash: receipt.passportHash,
      commitmentHash: receipt.signingCommitmentHash || undefined,
      receiptHash: receipt.hash,
      receiptId: receipt.id,
      txHash: receipt.txHash || row?.txHash || fill?.txHash,
      orderId: receipt.orderId || row?.orderId,
    });
  }

  for (const row of tape) {
    if (usedTape.has(row.id)) continue;
    const passport = row.passportHash ? passports.get(row.passportHash) : undefined;
    events.push({
      id: row.id,
      at: row.at,
      ticker: row.ticker,
      side: row.side,
      notional: row.usd,
      rail: row.rail,
      symbol: row.symbol,
      status: row.status.toUpperCase(),
      source: sourceFromTape(row.source, false),
      vendor: row.vendorName,
      passportHash: row.passportHash,
      commitmentHash: row.signingCommitmentHash,
      receiptId: row.receiptId,
      txHash: row.txHash,
      orderId: row.orderId,
      receiptHash: undefined,
    });
    if (passport && !events.at(-1)?.vendor) events.at(-1)!.vendor = passport.body.vendor || undefined;
  }

  for (const fill of fills) {
    if (usedFills.has(fill.id)) continue;
    events.push({
      id: fill.id,
      at: fill.at,
      ticker: fill.ticker,
      side: fill.side,
      notional: fill.usdt,
      rail: "—",
      symbol: "—",
      status: fill.status.toUpperCase(),
      source: "AGENT",
      passportHash: fill.passportHash,
      commitmentHash: fill.signingCommitmentHash,
      receiptId: fill.receiptId,
      txHash: fill.txHash,
    });
  }

  return events.sort((a, b) => b.at - a.at);
}

export function queryActivity(
  events: ActivityEvent[],
  query: { lens?: ActivityLens; status?: string; rail?: "all" | Rail; window?: ActivityWindow; search?: string; now?: number },
): ActivityEvent[] {
  const now = query.now ?? Date.now();
  const needle = (query.search || "").trim().toLowerCase();
  const start = query.window === "today" ? now - DAY : query.window === "7d" ? now - 7 * DAY : 0;
  return events.filter((event) => {
    if (query.lens === "user" && event.source !== "USER") return false;
    if (query.lens === "agent" && event.source !== "AGENT") return false;
    if (query.lens === "strategy" && event.source !== "STRATEGY") return false;
    if (query.status && query.status !== "all" && event.status !== query.status.toUpperCase()) return false;
    if (query.rail && query.rail !== "all" && event.rail !== query.rail) return false;
    if (start && event.at < start) return false;
    if (!needle) return true;
    if (event.ticker.toLowerCase().includes(needle) || event.symbol.toLowerCase().includes(needle)) return true;
    return [event.passportHash, event.commitmentHash, event.receiptHash, event.txHash, event.orderId, event.receiptId].some((value) => value?.toLowerCase().startsWith(needle));
  });
}

export function activityCounts(events: ActivityEvent[]): { executions: number; passports: number; receipts: number; agentActions: number } {
  return {
    executions: events.length,
    passports: new Set(events.map((event) => event.passportHash).filter(Boolean)).size,
    receipts: events.filter((event) => event.receiptHash || event.receiptId).length,
    agentActions: events.filter((event) => event.source === "AGENT" || event.source === "STRATEGY").length,
  };
}

function textOf(value: unknown): string | null {
  if (value == null || value === "") return null;
  return String(value);
}

function selector(data: unknown): string | null {
  const hex = textOf(data);
  if (!hex || !hex.startsWith("0x") || hex.length < 10) return null;
  return hex.slice(0, 10);
}

export function commitmentFacts(commitment: SigningCommitment | null | undefined, passportHash?: string): CommitmentFacts {
  if (!commitment) {
    return { scheme: null, hash: null, pair: "MISSING", evm: null, rfq: null, agentic: null };
  }
  const pair = passportHash && commitment.passportHash !== passportHash ? "MISMATCH" : "MATCHED";
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(commitment.canonical) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const domain = body.domain && typeof body.domain === "object" ? (body.domain as Record<string, unknown>) : null;
  return {
    scheme: commitment.scheme,
    hash: commitment.hash,
    pair,
    evm:
      commitment.scheme === "EVM_TX"
        ? {
            chainId: textOf(body.chainId),
            from: textOf(body.from),
            to: textOf(body.to),
            value: textOf(body.value),
            selector: selector(body.data),
            nonce: textOf(body.nonce),
            gasLimit: textOf(body.gasLimit),
            gasPrice: textOf(body.gasPrice),
            maxFeePerGas: textOf(body.maxFeePerGas),
            maxPriorityFeePerGas: textOf(body.maxPriorityFeePerGas),
            transactionType: textOf(body.transactionType),
          }
        : null,
    rfq:
      commitment.scheme === "EIP712_RFQ"
        ? { domain: textOf(domain?.name), chainId: textOf(domain?.chainId), primaryType: textOf(body.primaryType) }
        : null,
    agentic:
      commitment.scheme === "AGENTIC_MARKET"
        ? { side: textOf(body.side), fromToken: textOf(body.fromToken), toToken: textOf(body.toToken), fromQty: textOf(body.fromQty) }
        : null,
  };
}

export function replaySteps(input: { passport?: ExecutionPassport | null; receipt?: ExecutionReceipt | null; commitment?: SigningCommitment | null }): ReplayStep[] {
  const steps: ReplayStep[] = [];
  const passport = input.passport;
  const receipt = input.receipt;
  if (passport?.body.quotedAt) steps.push({ label: "QUOTE RECEIVED", at: passport.body.quotedAt });
  if (passport?.gate) steps.push({ label: `POLICY ${passport.gate.verdict}`, at: null });
  if (passport?.issuedAt) steps.push({ label: "PASSPORT ISSUED", at: passport.issuedAt });
  if (input.commitment) steps.push({ label: "SIGNING COMMITMENT", at: null });
  if (passport?.body.simulation.status && passport.body.simulation.status !== "NONE") {
    steps.push({ label: `SIMULATION ${passport.body.simulation.status}`, at: null });
  }
  if (receipt?.submittedAt) steps.push({ label: "SUBMITTED", at: receipt.submittedAt });
  if (receipt?.filledAt) steps.push({ label: "FILLED", at: receipt.filledAt });
  else if (receipt && receipt.status !== "submitted") steps.push({ label: receipt.status.toUpperCase(), at: null });
  return steps;
}

export function activityLayout(width: number): "stack" | "split" {
  return width >= 900 ? "split" : "stack";
}
