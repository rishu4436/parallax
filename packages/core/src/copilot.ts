import { formatPct, formatPx } from "./amounts";
import { listUnderlyings } from "./registry";
import { bestExecutable, type OpportunityCard } from "./opportunity";
import type { Rail, RailBook, Side } from "./types";

export type CopilotIntent =
  | { type: "gap"; minAbsPct: number }
  | { type: "net"; minAbsPct: number }
  | { type: "low-slip"; maxSlipPct: number }
  | { type: "compare"; ticker: string }
  | { type: "why" }
  | { type: "simulate"; ticker?: string }
  | { type: "buy"; usdt: string; ticker?: string; prefer: "liquidity" | "net" }
  | { type: "help" };

const TICKER = new Map(
  listUnderlyings().flatMap((item) => {
    const keys = [item.ticker.toLowerCase(), item.name.toLowerCase(), ...Object.values(item.wrappers).map((w) => w?.symbol.toLowerCase() || "")];
    return keys.filter(Boolean).map((key) => [key, item.ticker] as const);
  }),
);

function tickerIn(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [key, ticker] of TICKER) {
    if (new RegExp(`\\b${key}\\b`, "i").test(lower)) return ticker;
  }
  return undefined;
}

function pctIn(text: string, fallback: number): number {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return fallback;
  return Number(match[1]);
}

function usdtIn(text: string): string | undefined {
  const match = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:usdt|usd)?/i);
  if (!match) return undefined;
  if (!/\$/.test(text) && !/usdt|usd/i.test(text)) return undefined;
  return match[1];
}

export function parseCopilot(text: string): CopilotIntent {
  const q = text.trim().toLowerCase();
  if (!q) return { type: "help" };
  if (/why|flag|reason|explain/.test(q)) return { type: "why" };
  if (/simulat/.test(q)) return { type: "simulate", ticker: tickerIn(q) };
  if (/compar/.test(q)) return { type: "compare", ticker: tickerIn(q) || "NVDA" };
  if (/low(?:est)? slip|tight slip|slippage/.test(q) && /only|filter|show|low/.test(q)) {
    return { type: "low-slip", maxSlipPct: pctIn(q, 0.25) };
  }
  if (/buy|sell/.test(q)) {
    return { type: "buy", usdt: usdtIn(q) || "10", ticker: tickerIn(q), prefer: /liquid/.test(q) ? "liquidity" : "net" };
  }
  if (/net edge|net opportunity/.test(q)) return { type: "net", minAbsPct: pctIn(q, 0.75) };
  if (/away|gap|premium|discount|dislocat|more than|above/.test(q)) return { type: "gap", minAbsPct: pctIn(q, 1) };
  if (tickerIn(q)) return { type: "compare", ticker: tickerIn(q)! };
  return { type: "help" };
}

export interface CopilotReply {
  text: string;
  cards: OpportunityCard[];
  action?: { ticker: string; rail?: Rail; side?: Side; usdt?: string; analyze?: boolean; simulate?: boolean };
}

export function answerCopilot(
  intent: CopilotIntent,
  cards: OpportunityCard[],
  focus?: { ticker: string; books?: RailBook[]; netPct: number | null; symbol?: string },
): CopilotReply {
  const open = cards.filter((row) => row.status === "OPEN");
  if (intent.type === "help") {
    return {
      text: "Ask against the live book. Examples: opportunities above 1%, net edge 0.75%, compare NVDA, buy $500 of the most liquid NVDA rail, simulate this trade.",
      cards: open.slice(0, 3),
    };
  }
  if (intent.type === "why") {
    const row = focus?.symbol ? open.find((item) => item.symbol === focus.symbol) : bestExecutable(open.filter((item) => !focus || item.ticker === focus.ticker));
    if (!row) {
      return { text: "Nothing is flagged. An OPEN rail with a non-zero net edge after slip and gas would show here.", cards: [] };
    }
    return {
      text: `${row.symbol} is flagged because gross ${formatPct(row.grossPct)} versus ${row.referenceLabel} ${formatPx(row.reference)}, minus slip ${row.complete ? formatPct(row.slipPct) : "unknown"} minus gas ${formatPct(row.costPct)} = net ${formatPct(row.netPct)}. ${row.complete ? "Slip was measured on the quote." : "Slip was not measured, so it was not subtracted."}`,
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, analyze: true },
    };
  }
  if (intent.type === "compare") {
    const rows = cards.filter((row) => row.ticker === intent.ticker);
    if (!rows.length) return { text: `No live wrappers for ${intent.ticker} in this scan.`, cards: [] };
    const lines = rows.map((row) => `${row.symbol} ${formatPx(row.perShare)} ${formatPct(row.grossPct)} net ${formatPct(row.netPct)} ${row.status}`);
    return {
      text: `${intent.ticker} wrappers versus ${rows[0].referenceLabel} ${formatPx(rows[0].reference)}.\n${lines.join("\n")}`,
      cards: rows,
      action: { ticker: intent.ticker, analyze: true },
    };
  }
  if (intent.type === "simulate") {
    const ticker = intent.ticker || focus?.ticker;
    const row = bestExecutable(open.filter((item) => !ticker || item.ticker === ticker));
    if (!row) return { text: "No OPEN rail to simulate.", cards: [] };
    return {
      text: `Simulate ${row.symbol} at ${formatPx(row.perShare)}. SWAP rails run an on-chain simulation before SIGN. RFQ rails skip simulate and sign EIP-712.`,
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, simulate: true, side: "buy" },
    };
  }
  if (intent.type === "buy") {
    const pool = open.filter((item) => !intent.ticker || item.ticker === intent.ticker);
    const row = intent.prefer === "liquidity"
      ? [...pool].sort((a, b) => b.liquidity - a.liquidity)[0]
      : bestExecutable(pool);
    if (!row) return { text: "No OPEN rail to buy.", cards: [] };
    return {
      text: `Highest-${intent.prefer === "liquidity" ? "liquidity" : "net-edge"} OPEN rail is ${row.symbol} at ${formatPx(row.perShare)}, net ${formatPct(row.netPct)}. Size ${intent.usdt} USDT. You still sign in the wallet.`,
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, side: "buy", usdt: intent.usdt, simulate: true },
    };
  }
  if (intent.type === "low-slip") {
    const rows = open.filter((row) => row.complete && row.slipPct <= intent.maxSlipPct);
    return {
      text: rows.length
        ? `OPEN rails with measured slip ≤ ${formatPct(intent.maxSlipPct)}.\n${rows.map((row) => `${row.symbol} slip ${formatPct(row.slipPct)} net ${formatPct(row.netPct)}`).join("\n")}`
        : `No OPEN rail has measured slip ≤ ${formatPct(intent.maxSlipPct)}.`,
      cards: rows,
    };
  }
  if (intent.type === "gap") {
    const rows = open.filter((row) => Math.abs(row.grossPct) >= intent.minAbsPct);
    return {
      text: rows.length
        ? `OPEN rails ≥ ${formatPct(intent.minAbsPct)} away from the cash print.\n${rows.map((row) => `${row.symbol} ${formatPct(row.grossPct)} net ${formatPct(row.netPct)}`).join("\n")}`
        : `No OPEN rail is ${formatPct(intent.minAbsPct)} away from its cash print in this scan.`,
      cards: rows,
    };
  }
  const rows = open.filter((row) => Math.abs(row.netPct) >= intent.minAbsPct);
  return {
    text: rows.length
      ? `OPEN rails with |net edge| ≥ ${formatPct(intent.minAbsPct)}.\n${rows.map((row) => `${row.symbol} net ${formatPct(row.netPct)} (gross ${formatPct(row.grossPct)})`).join("\n")}`
      : `No OPEN rail clears ${formatPct(intent.minAbsPct)} net edge after slip and gas.`,
    cards: rows,
  };
}
