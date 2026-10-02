import { fromBaseUnits } from "./amounts";
import type { Rail, RailBook, RouterState, VenueQuote } from "./types";
import { QUOTE_TTL_MS } from "./types";

export class RouterReject extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterReject";
  }
}

export function scoreQuote(q: VenueQuote): number {
  if (!q.ok || !(q.perShare > 0) || !q.outAmount) return Number.NEGATIVE_INFINITY;
  const out = fromBaseUnits(q.outAmount, q.wrapper.decimals);
  if (!(out > 0)) return Number.NEGATIVE_INFINITY;
  const slipPenalty = (Math.max(0, q.slipBps500) / 10_000) * out;
  const gasTokens = q.perShare > 0 && q.gasUsd > 0 ? q.gasUsd / q.perShare : 0;
  return out - slipPenalty - gasTokens;
}

export function badgeFor(wrapperType: 1 | 2 | 3, modes: Array<VenueQuote["executionMode"]>): RailBook["badge"] {
  const set = new Set(modes.filter(Boolean));
  if (set.size === 0) return "—";
  if (set.has("RFQ") && set.has("SWAP")) return "RFQ+SWAP";
  if (set.has("RFQ")) return "RFQ";
  if (wrapperType === 2) return "AMM";
  return "SWAP";
}

export function statusFor(routes: VenueQuote[]): Pick<RailBook, "status" | "errorCode" | "errorText"> {
  const ok = routes.filter((r) => r.ok);
  if (ok.length) return { status: "OPEN" };
  const codes = routes.map((r) => r.errorCode).filter((c): c is number => typeof c === "number");
  const text = routes.map((r) => r.errorText).filter(Boolean).join(" · ");
  if (codes.includes(40367) || codes.includes(40369)) {
    const code = codes.includes(40367) ? 40367 : 40369;
    return { status: "CLOSED", errorCode: code, errorText: `${code} US hours` };
  }
  if (codes.some((c) => c === 40365 || c === 40368 || c === 40370 || c === 40374 || c === 40375)) {
    const code = codes[0];
    return { status: "HALTED", errorCode: code, errorText: text || String(code) };
  }
  const code = codes[0];
  return { status: "OFFLINE", errorCode: code, errorText: text || (code ? String(code) : "Quote failed") };
}

export function bookFromRoutes(routes: VenueQuote[]): RailBook {
  const wrapper = routes[0]?.wrapper;
  if (!wrapper) throw new Error("bookFromRoutes requires a wrapper.");
  const ranked = [...routes].sort((a, b) => scoreQuote(b) - scoreQuote(a));
  const best = ranked.find((r) => r.ok);
  const status = statusFor(routes);
  return {
    wrapper,
    routes: ranked,
    best,
    badge: badgeFor(wrapper.type, routes.map((r) => r.executionMode)),
    ...status,
  };
}

export function pickBest(books: RailBook[], railLock?: Rail, allowed?: Rail[]): RailBook | null {
  const pool = books.filter((b) => {
    if (railLock && b.wrapper.rail !== railLock) return false;
    if (allowed && !allowed.includes(b.wrapper.rail)) return false;
    return b.status === "OPEN" && b.best?.ok;
  });
  pool.sort((a, b) => scoreQuote(b.best as VenueQuote) - scoreQuote(a.best as VenueQuote));
  return pool[0] ?? null;
}

export interface ConfirmGate {
  sign: boolean;
  requote: boolean;
  cancel: boolean;
  reason?: string;
  expired: boolean;
}

export function plainSimulate(reason: string): string {
  const text = reason || "";
  if (/ERC20InsufficientBalance|insufficient balance/i.test(text)) {
    return "The wallet does not hold enough of the token you are selling.";
  }
  if (/insufficient funds|gas/i.test(text)) return "Not enough BNB for gas.";
  if (/allowance|ERC20InsufficientAllowance/i.test(text)) return "Token approval is short. Approve, then requote.";
  return text.replace(/^execution reverted:?\s*/i, "").trim() || "Simulation failed.";
}

export function quoteStillYoung(quoteExpiresAt: number, now = Date.now(), skewMs = 1500): boolean {
  return now + skewMs < quoteExpiresAt;
}

export function freshExpiry(now = Date.now()): number {
  return now + QUOTE_TTL_MS;
}

export function receivesLabel(q: VenueQuote): string {
  const qty = fromBaseUnits(q.outAmount, q.wrapper.decimals);
  const shown = qty >= 1 ? qty.toFixed(3) : qty.toPrecision(3);
  return `you receive ~${shown} ${q.wrapper.symbol}`;
}

export function bestLine(book: RailBook): string | null {
  if (!book.best) return null;
  const vendor = book.best.vendorName || book.badge;
  return `BEST EXECUTABLE → ${book.wrapper.symbol} · ${vendor} · ${receivesLabel(book.best)}`;
}

export const WALLET_MISMATCH = "Quote wallet does not match the signer. Requoting.";

/**
 * True when /swap will return EIP-712 typed data. Trust `executionMode` on the
 * route: Ondo can still come back LiquidMesh SWAP during a regular session.
 */
export function isRfqExecution(quote: { executionMode?: "SWAP" | "RFQ" }): boolean {
  return quote.executionMode === "RFQ";
}

/**
 * Ondo and bStocks bind `/quote` to `userWalletAddress`. Display quotes may use
 * the fallback wallet; a trade on those rails must re-quote with the signer.
 */
export function needsSignerQuote(quote: { executionMode?: "SWAP" | "RFQ"; wrapper: { rail: Rail } }): boolean {
  if (quote.executionMode === "RFQ") return true;
  return quote.wrapper.rail === "ondo" || quote.wrapper.rail === "bStock";
}

/** Wallet gate for the gold control. Same rails as `needsSignerQuote`. */
export function isRfqRoute(quote: { executionMode?: "SWAP" | "RFQ"; wrapper: { rail: Rail } }): boolean {
  return needsSignerQuote(quote);
}

export function signerMatchesQuote(signer?: string | null, quotedWallet?: string | null): boolean {
  if (!signer || !quotedWallet) return false;
  return signer.toLowerCase() === quotedWallet.toLowerCase();
}

export function gapPct(perShare: number, fridayClose: number | null): number | null {
  if (!fridayClose || !(fridayClose > 0) || !(perShare > 0)) return null;
  return ((perShare - fridayClose) / fridayClose) * 100;
}

export function relativePct(a: number, b: number): number | null {
  if (!(a > 0) || !(b > 0)) return null;
  return ((a - b) / b) * 100;
}

export function transition(state: RouterState, event: string): RouterState {
  const table: Record<string, Partial<Record<string, RouterState>>> = {
    idle: { resolve: "resolving" },
    resolving: { quote: "quoting", fail: "failed" },
    quoting: { select: "selecting", closed: "rail_closed", fail: "failed" },
    selecting: { build: "building", requote: "quoting", fail: "failed" },
    building: { simulate: "simulating", rfq: "awaiting_signature", fail: "failed", closed: "rail_closed" },
    simulating: { ready: "awaiting_signature", fail: "failed" },
    awaiting_signature: { submit: "submitting", expire: "expired", requote: "quoting", cancel: "selecting" },
    submitting: { poll: "polling", fail: "failed" },
    polling: { fill: "filled", fail: "failed", expire: "expired" },
    expired: { requote: "quoting", cancel: "selecting" },
    failed: { requote: "quoting", reset: "idle" },
    filled: { reset: "idle" },
    rail_closed: { requote: "quoting", reset: "idle" },
  };
  return table[state]?.[event] ?? state;
}
