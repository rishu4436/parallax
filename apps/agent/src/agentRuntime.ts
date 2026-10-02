import { readEnv } from "@parallax/config";
import {
  cashSession,
  commitAgenticSwap,
  Correlation,
  createStrategy,
  gapPct,
  getUnderlying,
  issuePassport,
  issueReceipt,
  passportFromBook,
  policyAllowsSend,
  receiptStatusFromSend,
  referenceFromBook,
  shortPassportHash,
  wrapperList,
  type AgentFill,
  type ArmedStrategy,
  type DeskStrategy,
  type ExecutionPassport,
  type Rail,
  type Settings,
  type Side,
} from "@parallax/core";
import { pushFill, readArmed, readWorkerEnabled, rememberExecution, spentTodayUsdt, upsertTape, writeArmed, writePassport } from "@parallax/core/persist";
import {
  fetchBnbMarket,
  fetchMarketPrint,
  fetchTradFiReference,
  isWeb3Error,
  prepareExecution,
  quoteIntent,
  readBalances,
  recordSlippage,
  Web3ApiError,
} from "@parallax/web3";
import { randomUUID } from "node:crypto";
import { sendAgentSwap, tokenQtyFromNotional } from "./execute";

const COOLDOWN_MS = 60_000;
let backoffUntil = 0;
let backoffMs = 1_000;

function stamp(row: ArmedStrategy, action: string, sent: boolean): void {
  const rows = readArmed().map((item) =>
    item.id === row.id ? { ...item, lastAction: action, lastAt: sent ? Date.now() : item.lastAt } : item,
  );
  writeArmed(rows);
}

function fill(partial: Omit<AgentFill, "id" | "at">): void {
  pushFill({ id: randomUUID(), at: Date.now(), ...partial });
}

function noteFill(row: ArmedStrategy, input: {
  ticker: string;
  side: Side;
  status: AgentFill["status"];
  note: string;
  spreadPct: number | null;
  gasUsd: number | null;
  x402: AgentFill["x402"];
  x402Detail: string;
  txHash?: string;
  sent: boolean;
  passportHash?: string;
  signingCommitmentHash?: string;
  receiptId?: string;
}): void {
  stamp(row, input.note, input.sent);
  fill({
    strategyId: row.id,
    strategyType: row.type,
    ticker: input.ticker,
    side: input.side,
    usdt: row.usdt,
    spreadPct: input.spreadPct,
    gasUsd: input.gasUsd,
    x402: input.x402,
    x402Detail: input.x402Detail,
    status: input.status,
    txHash: input.txHash,
    note: input.note,
    passportHash: input.passportHash,
    signingCommitmentHash: input.signingCommitmentHash,
    receiptId: input.receiptId,
  });
}

const PASSPORT_BLOCK = new Set(["rejected", "expired", "rail_closed", "offline", "sim_failed"]);

function rememberPassport(input: Parameters<typeof issuePassport>[0]): ExecutionPassport {
  const passport = issuePassport(input);
  writePassport(passport);
  return passport;
}

async function legPrint(ticker: string, rail: Rail) {
  const underlying = getUnderlying(ticker);
  const wrapper = underlying ? wrapperList(underlying).find((item) => item.rail === rail) : undefined;
  if (!wrapper) return null;
  const print = await fetchMarketPrint(wrapper.address);
  return { wrapper, print };
}

async function observe(row: ArmedStrategy, strategy: DeskStrategy, now: Date): Promise<{
  ticker: string;
  fire: boolean;
  reason: string;
} | null> {
  const ticker = (row.assetPairs[0] || "").toUpperCase();
  if (!ticker || !getUnderlying(ticker)) return { ticker, fire: false, reason: `${ticker || "ticker"} has no BSC wrapper` };

  if (row.type === "CROSS_ARB") {
    const bStock = await legPrint(ticker, "bStock");
    const ondo = await legPrint(ticker, "ondo");
    if (!bStock?.print.perShare || !ondo?.print.perShare) {
      return { ticker, fire: false, reason: `${ticker} is missing a bStock or Ondo print` };
    }
    const fire = strategy.evaluateCondition(
      { currentPrice: bStock.print.perShare, volume: bStock.print.volume },
      { referencePrice: ondo.print.perShare, isMarketOpen: bStock.print.isMarketOpen },
    );
    return { ticker, fire, reason: fire ? `spread ${strategy.spreadPct.toFixed(2)}%` : `spread ${strategy.spreadPct.toFixed(2)}% inside ${row.targetSpread}%` };
  }

  const primary = (await legPrint(ticker, "bStock")) || (await legPrint(ticker, "ondo")) || (await legPrint(ticker, "xStock"));
  if (!primary?.print.perShare) return { ticker, fire: false, reason: `${ticker} has no live BSC print` };
  const tradfi = await fetchTradFiReference(ticker, primary.wrapper.address);
  const reference = tradfi.referencePrice;
  if (reference == null) return { ticker, fire: false, reason: `${ticker} cash reference is unavailable` };

  if (row.type === "CORRELATION") {
    const bnb = await fetchBnbMarket();
    const equityGap = gapPct(primary.print.perShare, reference) ?? 0;
    const cryptoGap = bnb?.changePct ?? 0;
    const fire = strategy.evaluateCondition(
      { currentPrice: equityGap, volume: primary.print.volume },
      { referencePrice: cryptoGap, isMarketOpen: tradfi.isMarketOpen },
    );
    const weightNote = strategy instanceof Correlation ? ` · target weight ${Math.round(strategy.ratio * 100)}%` : "";
    return {
      ticker,
      fire,
      reason: fire
        ? `equity ${equityGap.toFixed(2)}% vs BNB ${cryptoGap.toFixed(2)}%${weightNote}`
        : `drift ${strategy.spreadPct.toFixed(2)}% inside the threshold${weightNote}`,
    };
  }

  const cashOpen = cashSession(now).atmosphere === "open";
  const isMarketOpen = cashOpen && tradfi.isMarketOpen;
  const fire = strategy.evaluateCondition(
    { currentPrice: primary.print.perShare, volume: primary.print.volume },
    { referencePrice: reference, isMarketOpen },
  );
  return {
    ticker,
    fire,
    reason: fire ? `basis ${strategy.spreadPct.toFixed(2)}% vs ${tradfi.source}` : isMarketOpen ? "cash session is open" : `basis ${strategy.spreadPct.toFixed(2)}% inside ${row.targetSpread}%`,
  };
}

async function broadcast(row: ArmedStrategy, strategy: DeskStrategy, ticker: string, agent: `0x${string}`, settings: Settings, x402: AgentFill["x402"], x402Detail: string): Promise<void> {
  const rail = strategy.rail || undefined;
  const book = await quoteIntent(
    { ticker, side: strategy.side, usdt: row.usdt, wallet: agent, railLock: rail, actor: "agent" },
    { slip: false, allowed: settings.allowedRails },
  );
  const preferred = rail ? book.books.find((item) => item.wrapper.rail === rail) : null;
  const chosen = preferred?.best?.ok ? preferred : book.best;
  const quote = chosen?.best;
  const spentToday = spentTodayUsdt();
  const intent = {
    ticker,
    side: strategy.side,
    usdt: row.usdt,
    railLock: quote?.wrapper.rail ?? rail,
    vendorLock: quote?.vendorName,
    wallet: agent,
    actor: "agent" as const,
  };

  if (!quote?.ok) {
    const passport = quote
      ? rememberPassport({
          intent,
          quote,
          underlying: { ticker: book.underlying.ticker, name: book.underlying.name },
          reference: referenceFromBook(book),
          settings,
          spentToday,
          source: "agentic",
          signer: agent,
        })
      : passportFromBook({ intent, book, settings, spentToday, source: "agentic", signer: agent });
    if (passport) writePassport(passport);
    noteFill(row, {
      ticker,
      side: strategy.side,
      status: "skipped",
      note: chosen?.errorText || `${ticker} quote is not executable`,
      spreadPct: strategy.spreadPct,
      gasUsd: null,
      x402,
      x402Detail,
      sent: false,
      passportHash: passport?.hash,
    });
    return;
  }

  const prepared = await prepareExecution({
    intent: {
      ticker,
      side: strategy.side,
      usdt: row.usdt,
      railLock: quote.wrapper.rail,
      vendorLock: quote.vendorName,
      wallet: agent,
      actor: "agent",
    },
    settings,
    spentToday,
    quote,
    source: "agentic",
    reference: referenceFromBook(book),
  });
  const liveQuote = "quote" in prepared && prepared.quote ? prepared.quote : quote;
  const passport = rememberPassport({
    intent: { ...intent, railLock: liveQuote.wrapper.rail, vendorLock: liveQuote.vendorName },
    quote: liveQuote,
    underlying: { ticker: book.underlying.ticker, name: book.underlying.name },
    reference: referenceFromBook(book),
    settings,
    spentToday,
    prepare: prepared,
    source: "agentic",
    signer: agent,
  });
  const allowed = passport.gate ? policyAllowsSend(passport.gate) : false;

  if (prepared.step === "rejected" || prepared.step === "expired" || PASSPORT_BLOCK.has(passport.state) || !allowed) {
    const policyNote = passport.gate?.primary
      ? `${passport.gate.verdict} ${passport.gate.primary.code}: ${passport.gate.primary.human}`
      : `passport ${passport.state} ${shortPassportHash(passport.hash)} · ${passport.reason}`;
    noteFill(row, {
      ticker,
      side: strategy.side,
      status: "skipped",
      note:
        prepared.step === "rejected" || prepared.step === "expired"
          ? prepared.message
          : policyNote,
      spreadPct: strategy.spreadPct,
      gasUsd: quote.gasUsd,
      x402,
      x402Detail,
      sent: false,
      passportHash: passport.hash,
    });
    return;
  }

  if (prepared.step === "sign-swap") {
    strategy.remember({ to: prepared.tx.to, data: prepared.tx.data, value: prepared.tx.value });
    if (prepared.simulateStatus !== "SUCCESS") {
      noteFill(row, {
        ticker,
        side: strategy.side,
        status: "skipped",
        note: prepared.simulateReason || "Simulation failed",
        spreadPct: strategy.spreadPct,
        gasUsd: quote.gasUsd,
        x402,
        x402Detail,
        sent: false,
        passportHash: passport.hash,
      });
      return;
    }
  }

  const payload = strategy.generateSwapPayload();
  const tokenQty = strategy.side === "sell" ? tokenQtyFromNotional(row.usdt, quote.perShare) || undefined : undefined;
  const commitment = commitAgenticSwap({
    passportHash: passport.hash,
    side: strategy.side,
    token: quote.wrapper.address,
    usdt: row.usdt,
    tokenQty,
  });
  const sent = await sendAgentSwap({
    side: strategy.side,
    usdt: row.usdt,
    token: quote.wrapper.address,
    tokenQty,
  });
  const after = await fetchMarketPrint(quote.wrapper.address);
  const realizedSlippageBps =
    after.perShare && quote.perShare
      ? Math.round(((after.perShare - quote.perShare) / quote.perShare) * 10_000)
      : null;
  if (after.perShare) {
    recordSlippage({
      path: `${quote.wrapper.symbol} ${quote.vendorName || quote.wrapper.rail}`,
      quotePerShare: quote.perShare,
      executedPerShare: after.perShare,
      note: sent.txHash || sent.orderId,
    });
  }
  const receipt = issueReceipt({
    id: sent.orderId || randomUUID(),
    passportHash: passport.hash,
    signingCommitmentHash: commitment.hash,
    txHash: sent.txHash,
    orderId: sent.orderId,
    status: receiptStatusFromSend(sent),
    source: "agentic",
    note: sent.note,
    actualOutput: after.perShare != null ? String(after.perShare) : null,
    realizedSlippageBps,
    filledAt: sent.done ? Date.now() : undefined,
  });
  rememberExecution({ passport, commitment, receipt });
  const simulated = payload.data !== "0x" ? ` · simulated ${payload.to}` : "";
  const failed = sent.note.includes("failed");
  const submitted = Boolean(sent.orderId || sent.txHash);
  noteFill(row, {
    ticker,
    side: strategy.side,
    status: failed ? "failed" : submitted ? "filled" : "skipped",
    note: `${sent.note}${simulated} · spread ${strategy.spreadPct.toFixed(2)}% · gas ${quote.gasUsd.toFixed(4)} · x402 ${x402Detail} · passport ${shortPassportHash(passport.hash)} · receipt ${shortPassportHash(receipt.hash)}`,
    spreadPct: strategy.spreadPct,
    gasUsd: quote.networkFeeUsd ?? quote.gasUsd,
    x402,
    x402Detail,
    txHash: sent.txHash,
    sent: submitted || sent.pending,
    passportHash: passport.hash,
    signingCommitmentHash: commitment.hash,
    receiptId: receipt.id,
  });
  if (submitted || failed) {
    upsertTape({
      id: sent.orderId || receipt.id,
      at: Date.now(),
      side: strategy.side,
      ticker,
      symbol: quote.wrapper.symbol,
      rail: quote.wrapper.rail,
      usd: row.usdt,
      status: sent.note.includes("failed") ? "failed" : sent.done ? "filled" : "submitted",
      txHash: sent.txHash,
      orderId: sent.orderId,
      vendorName: quote.vendorName,
      source: "agent",
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      receiptId: receipt.id,
    });
  }
}

async function equityWeight(wallet: `0x${string}`, ticker: string, perShare: number): Promise<number | null> {
  const report = await readBalances(wallet);
  const tokens = report.lines.filter((line) => line.ticker === ticker).reduce((sum, line) => sum + line.amount, 0);
  const stables = report.lines.filter((line) => !line.ticker).reduce((sum, line) => sum + line.amount, 0);
  const total = tokens * perShare + stables;
  if (!(total > 0)) return null;
  return (tokens * perShare) / total;
}

function reportOnce(row: ArmedStrategy, note: string, body: Omit<AgentFill, "id" | "at" | "note">): void {
  if (row.lastAction === note) return;
  noteFill(row, { ...body, note, sent: false });
}

/**
 * Polls armed strategies and broadcasts through the Agentic Wallet session on this machine.
 * ERC-8004 identity stays AGENT_ERC8004_ID from `bag deploy`. This loop does not mint a key.
 * A fired condition is quoted, simulated when the route is a swap, then sent by `baw`.
 * It is not written back onto the human signature queue.
 */
export async function runArmedDesk(input: {
  agent: `0x${string}` | null;
  x402: "funded" | "low";
  x402Detail: string;
  settings: Settings;
  now: Date;
}): Promise<void> {
  if (!readWorkerEnabled() || input.settings.killSwitch) return;
  if (Date.now() < backoffUntil) return;
  const identity = readEnv().agentId;
  const rows = readArmed().filter((row) => !row.paused);
  for (const row of rows) {
    if (row.lastAt && Date.now() - row.lastAt < COOLDOWN_MS) continue;
    try {
      const strategy = createStrategy(row);
      const seen = await observe(row, strategy, input.now);
      if (!seen) continue;
      if (!seen.fire) {
        if (row.lastAction !== seen.reason) stamp(row, seen.reason, false);
        continue;
      }
      if (strategy instanceof Correlation && input.agent) {
        const primary = await legPrint(seen.ticker, "bStock");
        const weight = primary?.print.perShare
          ? await equityWeight(input.agent, seen.ticker, primary.print.perShare).catch(() => null)
          : null;
        if (weight != null) {
          const onTarget = (strategy.side === "buy" && weight >= strategy.ratio) || (strategy.side === "sell" && weight <= strategy.ratio);
          if (onTarget) {
            const reason = `weight ${(weight * 100).toFixed(1)}% is already past the ${Math.round(strategy.ratio * 100)}% target`;
            if (row.lastAction !== reason) stamp(row, reason, false);
            continue;
          }
        }
      }
      if (!input.agent) {
        const note = `condition true (${seen.reason}) · Agentic Wallet is signed out${identity ? ` · ${identity}` : ""}`;
        reportOnce(row, note, {
          strategyId: row.id,
          strategyType: row.type,
          ticker: seen.ticker,
          side: strategy.side,
          usdt: row.usdt,
          spreadPct: strategy.spreadPct,
          gasUsd: null,
          x402: input.x402,
          x402Detail: input.x402Detail,
          status: "skipped",
        });
        continue;
      }
      if (input.x402 === "low" && input.x402Detail.includes("402")) {
        const note = `condition true (${seen.reason}) · x402 payment required`;
        reportOnce(row, note, {
          strategyId: row.id,
          strategyType: row.type,
          ticker: seen.ticker,
          side: strategy.side,
          usdt: row.usdt,
          spreadPct: strategy.spreadPct,
          gasUsd: null,
          x402: input.x402,
          x402Detail: input.x402Detail,
          status: "skipped",
        });
        continue;
      }
      await broadcast(row, strategy, seen.ticker, input.agent, input.settings, input.x402, input.x402Detail);
      backoffMs = 1_000;
    } catch (err) {
      const limited = (err instanceof Web3ApiError && err.httpStatus === 429) || (isWeb3Error(err) && err.httpStatus === 429);
      if (limited) {
        backoffMs = Math.min(60_000, backoffMs * 2);
        backoffUntil = Date.now() + backoffMs;
        break;
      }
      const message = err instanceof Error ? err.message : String(err);
      reportOnce(row, message, {
        strategyId: row.id,
        strategyType: row.type,
        ticker: (row.assetPairs[0] || "").toUpperCase(),
        side: "buy",
        usdt: row.usdt,
        spreadPct: null,
        gasUsd: null,
        x402: input.x402,
        x402Detail: input.x402Detail,
        status: "failed",
      });
    }
  }
}
