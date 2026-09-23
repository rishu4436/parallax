import { readEnv } from "@parallax/config";
import {
  assertBuildAllowed,
  cashSession,
  decideJob,
  fetchCashPrints,
  fridayPrintFromCash,
  gapPct,
  jobDue,
  jobQuoteUsdt,
  jobRailLock,
  jobTickers,
  listUnderlyings,
  nextLastAt,
  RouterReject,
  snapshotRails,
} from "@parallax/core";
import { pushQueue, readJobs, readQueue, readSettings, spentTodayUsdt, writeBeat, writeFriday, writeJobs } from "@parallax/core/persist";
import { quoteIntent } from "@parallax/web3";
import { randomUUID } from "node:crypto";

async function x402Status(): Promise<{ x402: "funded" | "low"; detail: string }> {
  const env = readEnv();
  if (!env.x402Url) return { x402: "low", detail: "x402 endpoint unset" };
  try {
    const res = await fetch(env.x402Url);
    if (res.status === 402) return { x402: "low", detail: "402 payment required" };
    if (!res.ok) return { x402: "low", detail: `HTTP ${res.status}` };
    return { x402: "funded", detail: `HTTP ${res.status}` };
  } catch (err) {
    return { x402: "low", detail: err instanceof Error ? err.message : "x402 unreachable" };
  }
}

async function tick() {
  const env = readEnv();
  const settings = readSettings();
  const pay = await x402Status();
  const identity = env.agentId || "unset";
  if (settings.killSwitch) {
    writeBeat({ at: Date.now(), status: "stopped", x402: pay.x402, x402Detail: `${pay.detail}. Kill switch is on.`, identity });
    console.log("paused by kill switch");
    return;
  }
  writeBeat({ at: Date.now(), status: "live", x402: pay.x402, x402Detail: pay.detail, identity });
  const now = new Date();
  const session = cashSession(now);
  const jobs = readJobs();
  let changed = false;
  for (const job of jobs) {
    if (!jobDue(job, now.getTime())) continue;
    const notes: string[] = [];
    let retryMs: number | null = null;
    let queuedAny = false;
    try {
      for (const ticker of jobTickers(job)) {
        const book = await quoteIntent(
          {
            ticker,
            side: "buy",
            usdt: jobQuoteUsdt(job),
            wallet: env.quoteWallet,
            railLock: jobRailLock(job),
          },
          { slip: job.type === "cheap_rail" || job.type === "gap_fade" || job.type === "open_print", allowed: settings.allowedRails },
        );
        const bestQuote = book.best?.best;
        const px = bestQuote?.perShare;
        const gapFriday = px && book.fridayClose ? gapPct(px, book.fridayClose) : null;
        const gapPrior = px && book.priorClose ? gapPct(px, book.priorClose) : null;
        const rails = snapshotRails(book.books);
        const decision = decideJob(job, {
          now,
          session,
          gapPct: gapPrior ?? gapFriday,
          railOpen: Boolean(bestQuote?.ok),
          wallet: env.quoteWallet,
          ticker,
          lastAction: job.lastAction,
          rails,
          fridayClose: book.fridayClose,
          priorClose: book.priorClose,
          priorOpen: book.priorOpen,
          priorDate: book.priorDate,
          fridayDate: book.fridayDate,
          sessionOpen: book.sessionOpen,
          gapVsFriday: gapFriday,
          gapVsPriorClose: gapPrior,
          gapVsPriorOpen: px && book.priorOpen ? gapPct(px, book.priorOpen) : null,
          gapVsSessionOpen: px && book.sessionOpen ? gapPct(px, book.sessionOpen) : null,
          bestRail: book.best?.wrapper.rail,
          slipBps500: bestQuote?.slipBps500 ?? null,
          slipKnown: Boolean(bestQuote?.slipKnown),
        });
        if (decision.retryMs != null) retryMs = decision.retryMs;
        for (const intent of decision.intents) {
          const waiting = readQueue().some((row) => row.jobId === job.id && row.ticker === intent.ticker && row.side === intent.side);
          if (waiting) {
            notes.push(`waiting for signature · ${intent.side} ${intent.usdt} ${intent.ticker}`);
            retryMs = 120_000;
            continue;
          }
          assertBuildAllowed({ ...intent, actor: "agent" }, settings, spentTodayUsdt(now));
          pushQueue({
            id: randomUUID(),
            at: now.getTime(),
            ticker: intent.ticker,
            side: intent.side,
            usdt: intent.usdt,
            railLock: intent.railLock,
            reason: `${job.name} queued for a wallet signature`,
            jobId: job.id,
          });
          notes.push(decision.action);
          queuedAny = true;
          console.log(decision.action);
        }
        if (!decision.intents.length) notes.push(decision.action);
      }
      job.lastAction = notes.filter(Boolean).join(" · ") || job.lastAction;
      job.lastAt = queuedAny ? now.getTime() : nextLastAt(now.getTime(), job.cron, retryMs);
      changed = true;
    } catch (err) {
      job.lastAction = err instanceof RouterReject ? err.message : err instanceof Error ? err.message : String(err);
      job.lastAt = nextLastAt(now.getTime(), job.cron, 120_000);
      changed = true;
      console.log(`${job.name}: ${job.lastAction}`);
    }
  }
  if (changed) writeJobs(jobs);

  if (session.et.weekday === 5 && session.et.hour >= 16) {
    for (const underlying of listUnderlyings()) {
      const cash = await fetchCashPrints(underlying.ticker, now).catch(() => null);
      const print = cash ? fridayPrintFromCash(underlying.ticker, cash) : null;
      if (!print) continue;
      writeFriday(underlying.ticker, print);
    }
  }
}

console.log("PARALLAX desk worker. No key is held. Jobs stop at the signature.");
void tick();
setInterval(() => void tick(), 20_000);
