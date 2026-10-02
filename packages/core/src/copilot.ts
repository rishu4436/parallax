import { formatPct, formatPx } from "./amounts";
import { listUnderlyings } from "./registry";
import { bestExecutable, type OpportunityCard } from "./opportunity";
import type { Rail, RailBook, Side } from "./types";

export type CopilotIntent =
  | { type: "gap"; minAbsPct: number }
  | { type: "net"; minAbsPct: number }
  | { type: "low-slip"; maxSlipPct: number }
  | { type: "compare"; ticker: string }
  | { type: "cheapest"; ticker?: string }
  | { type: "reference"; ticker?: string }
  | { type: "changed"; ticker?: string }
  | { type: "why" }
  | { type: "simulate"; ticker?: string }
  | { type: "buy"; usdt: string; ticker?: string; prefer: "liquidity" | "net" }
  | { type: "liquidity"; ticker: string }
  | { type: "strategy"; ticker: string; minAbsPct: number }
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
  if (/strateg|arm |watch/.test(q)) return { type: "strategy", ticker: tickerIn(q) || "NVDA", minAbsPct: pctIn(q, 1) };
  if (/why|flag|reason|explain/.test(q)) return { type: "why" };
  if (/what changed|changed on/.test(q)) return { type: "changed", ticker: tickerIn(q) };
  if (/cheapest|lowest executable|lowest available/.test(q)) return { type: "cheapest", ticker: tickerIn(q) };
  if (/simulat/.test(q)) return { type: "simulate", ticker: tickerIn(q) };
  if (/compar/.test(q)) return { type: "compare", ticker: tickerIn(q) || "NVDA" };
  if (/liquid/.test(q) && !/buy|sell/.test(q)) return { type: "liquidity", ticker: tickerIn(q) || "NVDA" };
  if (/low(?:est)? slip|tight slip|slippage/.test(q) && /only|filter|show|low/.test(q)) {
    return { type: "low-slip", maxSlipPct: pctIn(q, 0.25) };
  }
  if (/buy|sell/.test(q)) {
    return { type: "buy", usdt: usdtIn(q) || "10", ticker: tickerIn(q), prefer: /liquid/.test(q) ? "liquidity" : "net" };
  }
  if (/net edge|net opportunity/.test(q)) return { type: "net", minAbsPct: pctIn(q, 0.75) };
  if (/away|gap|premium|discount|dislocat|more than|above/.test(q)) return { type: "gap", minAbsPct: pctIn(q, 1) };
  if (/reference price|prior close|friday close/.test(q)) return { type: "reference", ticker: tickerIn(q) };
  if (tickerIn(q)) return { type: "compare", ticker: tickerIn(q)! };
  return { type: "help" };
}

export interface CopilotReply {
  text: string;
  cards: OpportunityCard[];
  action?: { ticker: string; rail?: Rail; side?: Side; usdt?: string; analyze?: boolean; simulate?: boolean; arm?: boolean; minNetPct?: number };
}

function brief(answer: string, evidence: string[], action?: string): string {
  const lines = ["ANSWER", answer, "", "EVIDENCE", ...(evidence.length ? evidence : ["No live quote on this book."])];
  if (action) lines.push("", "ACTION", action);
  return lines.join("\n");
}

function livePrice(row: OpportunityCard): string {
  return row.perShare != null && row.perShare > 0 ? formatPx(row.perShare) : "—";
}

function shownPct(value: number | null): string {
  return value == null ? "—" : formatPct(value);
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
      return { text: brief("Nothing is flagged.", ["An OPEN rail with a measured net edge would show here."]), cards: [] };
    }
    const reference = row.reference != null && row.reference > 0 ? `${row.referenceLabel} ${formatPx(row.reference)}` : "REFERENCE UNAVAILABLE";
    return {
      text: brief(
        `${row.symbol} is flagged on a ${shownPct(row.netPct)} net edge.`,
        [
          `Gross ${shownPct(row.grossPct)} versus ${reference}.`,
          `Slip ${row.complete && row.slipPct != null ? formatPct(row.slipPct) : "unknown"}. Gas ${shownPct(row.costPct)}.`,
        ],
        `Analyze ${row.symbol}`,
      ),
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, analyze: true },
    };
  }
  if (intent.type === "cheapest") {
    const ticker = intent.ticker || focus?.ticker;
    const pool = open.filter((row) => (!ticker || row.ticker === ticker) && row.perShare != null && row.perShare > 0);
    const row = [...pool].sort((a, b) => (a.perShare ?? 0) - (b.perShare ?? 0) || a.symbol.localeCompare(b.symbol))[0];
    if (!row) return { text: brief("No executable rail.", ["NO EXECUTABLE QUOTE"]), cards: [] };
    const peers = cards.filter((item) => item.ticker === row.ticker);
    return {
      text: brief(
        `${row.symbol} is the lowest available executable rail.`,
        peers.map((item) => `${item.symbol} ${livePrice(item)} ${item.status}`),
        `Analyze ${row.symbol}`,
      ),
      cards: peers,
      action: { ticker: row.ticker, rail: row.rail, analyze: true },
    };
  }
  if (intent.type === "reference") {
    const ticker = intent.ticker || focus?.ticker;
    const row = cards.find((item) => (!ticker || item.ticker === ticker) && item.reference != null && item.reference > 0);
    if (!row || row.reference == null) return { text: brief("Reference is unavailable.", ["REFERENCE UNAVAILABLE"]), cards: [] };
    return {
      text: brief(`${row.ticker} reference is ${formatPx(row.reference)}.`, [`${row.referenceLabel}.`], `Open ${row.ticker}`),
      cards: cards.filter((item) => item.ticker === row.ticker),
      action: { ticker: row.ticker, analyze: true },
    };
  }
  if (intent.type === "changed") {
    const ticker = intent.ticker || focus?.ticker;
    const row = bestExecutable(open.filter((item) => !ticker || item.ticker === ticker));
    if (!row || row.reference == null || row.reference <= 0 || row.perShare == null || row.perShare <= 0) {
      return { text: brief("No live comparison.", ["REFERENCE UNAVAILABLE"]), cards: [] };
    }
    return {
      text: brief(
        `${row.symbol} is ${shownPct(row.grossPct)} versus ${row.referenceLabel}.`,
        [`Tokenized price ${formatPx(row.perShare)}.`, `Reference ${formatPx(row.reference)}.`],
        `Analyze ${row.symbol}`,
      ),
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, analyze: true },
    };
  }
  if (intent.type === "compare") {
    const rows = cards.filter((row) => row.ticker === intent.ticker);
    if (!rows.length) return { text: brief(`No live wrappers for ${intent.ticker}.`, ["NO EXECUTABLE QUOTE"]), cards: [] };
    const reference = rows.find((row) => row.reference != null && row.reference > 0);
    return {
      text: brief(
        reference && reference.reference != null ? `${intent.ticker} reference is ${formatPx(reference.reference)}.` : `${intent.ticker} reference is unavailable.`,
        rows.map((row) => `${row.symbol} ${livePrice(row)} ${row.status}`),
        `Analyze ${intent.ticker}`,
      ),
      cards: rows,
      action: { ticker: intent.ticker, analyze: true },
    };
  }
  if (intent.type === "simulate") {
    const ticker = intent.ticker || focus?.ticker;
    const row = bestExecutable(open.filter((item) => !ticker || item.ticker === ticker));
    if (!row) return { text: "No OPEN rail to simulate.", cards: [] };
    return {
      text: `Simulate ${row.symbol} at ${row.perShare != null ? formatPx(row.perShare) : "—"}. SWAP rails run an on-chain simulation before SIGN. RFQ rails skip simulate and sign EIP-712.`,
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, simulate: true, side: "buy" },
    };
  }
  if (intent.type === "buy") {
    const pool = open.filter((item) => !intent.ticker || item.ticker === intent.ticker);
    const row = intent.prefer === "liquidity"
      ? [...pool].sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1))[0]
      : bestExecutable(pool);
    if (!row) return { text: "No OPEN rail to buy.", cards: [] };
    const price = row.perShare != null ? formatPx(row.perShare) : "—";
    const text = intent.prefer === "liquidity" && row.liquidity == null
      ? `No measured liquidity on an OPEN rail. ${row.symbol} is OPEN at ${price}, net ${shownPct(row.netPct)}. Size ${intent.usdt} USDT. You still sign in the wallet.`
      : `Highest-${intent.prefer === "liquidity" ? "liquidity" : "net-edge"} OPEN rail is ${row.symbol} at ${price}, net ${shownPct(row.netPct)}. Size ${intent.usdt} USDT. You still sign in the wallet.`;
    return {
      text,
      cards: [row],
      action: { ticker: row.ticker, rail: row.rail, side: "buy", usdt: intent.usdt, simulate: true },
    };
  }
  if (intent.type === "low-slip") {
    const rows = open.filter((row) => row.complete && row.slipPct != null && row.slipPct <= intent.maxSlipPct);
    return {
      text: rows.length
        ? `OPEN rails with measured slip ≤ ${formatPct(intent.maxSlipPct)}.\n${rows.map((row) => `${row.symbol} slip ${shownPct(row.slipPct)} net ${shownPct(row.netPct)}`).join("\n")}`
        : `No OPEN rail has measured slip ≤ ${formatPct(intent.maxSlipPct)}.`,
      cards: rows,
    };
  }
  if (intent.type === "liquidity") {
    const rows = [...cards.filter((row) => row.ticker === intent.ticker)].sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1));
    const top = rows[0];
    const volume = top?.liquidity;
    return {
      text: top && volume != null
        ? `Highest quoted volume on ${intent.ticker} is ${top.symbol} at ${volume.toFixed(0)}. This is 24h kline volume, not a CEX book.`
        : `No liquidity print for ${intent.ticker} in this scan.`,
      cards: rows.slice(0, 3),
      action: top && volume != null ? { ticker: intent.ticker, rail: top.rail, analyze: true } : undefined,
    };
  }
  if (intent.type === "strategy") {
    return {
      text: `Arm a watch on ${intent.ticker} for |net edge| ≥ ${formatPct(intent.minAbsPct)}. Execution still requires wallet approval.`,
      cards: open.filter((row) => row.ticker === intent.ticker),
      action: { ticker: intent.ticker, arm: true, minNetPct: intent.minAbsPct, analyze: true },
    };
  }
  if (intent.type === "gap") {
    const rows = open.filter((row) => row.grossPct != null && Math.abs(row.grossPct) >= intent.minAbsPct);
    return {
      text: rows.length
        ? `OPEN rails ≥ ${formatPct(intent.minAbsPct)} away from the cash print.\n${rows.map((row) => `${row.symbol} ${shownPct(row.grossPct)} net ${shownPct(row.netPct)}`).join("\n")}`
        : `No OPEN rail is ${formatPct(intent.minAbsPct)} away from its cash print in this scan.`,
      cards: rows,
    };
  }
  const rows = open.filter((row) => row.netPct != null && Math.abs(row.netPct) >= intent.minAbsPct);
  return {
    text: rows.length
      ? `OPEN rails with |net edge| ≥ ${formatPct(intent.minAbsPct)}.\n${rows.map((row) => `${row.symbol} net ${shownPct(row.netPct)} (gross ${shownPct(row.grossPct)})`).join("\n")}`
      : `No OPEN rail clears ${formatPct(intent.minAbsPct)} net edge after slip and gas.`,
    cards: rows,
  };
}
