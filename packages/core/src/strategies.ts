import { formatPct } from "./amounts";
import type { CashPrints } from "./friday";
import { cashGaps, shortYmd } from "./friday";
import type { JobContext, RailSnap } from "./jobs";
import { decideJob, jobTickers, presetCron } from "./jobs";
import { gapPct } from "./router";
import type { CashSession } from "./session";
import type {
  CheapRailSpec,
  DcaSpec,
  FlattenSpec,
  GapFadeSpec,
  Job,
  JobType,
  OpenPrintSpec,
  QueueMode,
  Rail,
  RailBook,
  WeekendCapSpec,
} from "./types";

export type StrategyId =
  | "dca"
  | "index_core"
  | "cheap_rail"
  | "weekend_cap"
  | "gap_fade"
  | "open_print"
  | "flatten_earnings"
  | "session_hours";

export type AdviceStatus = "fire" | "wait" | "skip" | "info";

export interface StrategyCard {
  id: StrategyId;
  jobType: JobType | null;
  name: string;
  kicker: string;
  thesis: string;
  when: string;
  skip: string;
  rails: string;
  cadenceHint: string;
}

export interface Advice {
  id: StrategyId;
  name: string;
  status: AdviceStatus;
  headline: string;
  reason: string;
  jobType: JobType | null;
}

export interface DeskSignals {
  ticker: string;
  now: Date;
  session: CashSession;
  fridayClose: number | null;
  fridayOpen: number | null;
  fridayDate: string | null;
  priorClose: number | null;
  priorOpen: number | null;
  priorDate: string | null;
  sessionOpen: number | null;
  sessionOpenDate: string | null;
  rails: RailSnap[];
  openRails: Rail[];
  cheapest: RailSnap | null;
  richest: RailSnap | null;
  crossRailBps: number | null;
  gapPct: number | null;
  gapVsFriday: number | null;
  gapVsPriorClose: number | null;
  gapVsPriorOpen: number | null;
  gapVsSessionOpen: number | null;
  gapByRail: Partial<Record<Rail, number>>;
  cashDark: boolean;
}

export const STRATEGY_CATALOG: StrategyCard[] = [
  {
    id: "dca",
    jobType: "dca",
    name: "Session DCA",
    kicker: "Accumulate",
    thesis:
      "Buy a fixed USDT clip on a cadence, only on an open rail. Optional premium cap skips a print that is already rich versus the prior cash close.",
    when: "A rail is OPEN and the clip is inside the order and daily caps.",
    skip: "Every rail CLOSED or HALTED. Kill switch. Optional max premium versus prior close.",
    rails: "Best open rail, or a locked wrapper.",
    cadenceHint: "1h or weekday 09:30 ET",
  },
  {
    id: "index_core",
    jobType: "dca",
    name: "Index core",
    kicker: "QQQ · SPY",
    thesis:
      "Same DCA rules, pointed at QQQ and SPY wrappers. Broad names usually have the deepest RFQ during cash hours and the least single-name earnings gap.",
    when: "QQQ or SPY has an OPEN rail.",
    skip: "Both index rails dark. Same caps as every other job.",
    rails: "Best open rail per name.",
    cadenceHint: "weekday 09:30 ET",
  },
  {
    id: "cheap_rail",
    jobType: "cheap_rail",
    name: "Cheap rail",
    kicker: "Cross-wrapper",
    thesis:
      "NVDAB, NVDAon, and NVDAx are three contracts, not one share. When two rails are OPEN, buy the cheaper per-share print after the dividend multiplier. This is accumulation on the cheap claim, not a round-trip arb.",
    when: "At least two rails OPEN and the per-share spread is at or above the basis-point floor.",
    skip: "One or zero open rails. Spread inside the floor. Slip on the cheap rail above the cap.",
    rails: "Locks the cheapest OPEN rail.",
    cadenceHint: "15m during cash hours",
  },
  {
    id: "weekend_cap",
    jobType: "weekend_cap",
    name: "Weekend discovery",
    kicker: "Follow the gap",
    thesis:
      "When the wrapper trades rich versus Friday cash close, treat it as weekend price discovery. Queue a buy for cash open, or take an open rail if one exists. Large weekend moves have often led Monday’s cash open.",
    when: "Gap versus Friday is above the cap and a rail is OPEN, or cash is about to open.",
    skip: "Friday ref missing. Gap inside the cap. Queue mode while cash is dark and no open rail.",
    rails: "Best OPEN rail. After hours that is often xStock.",
    cadenceHint: "weekday 09:30 ET",
  },
  {
    id: "gap_fade",
    jobType: "gap_fade",
    name: "Prior-close discount",
    kicker: "Buy the washout",
    thesis:
      "When the wrapper trades cheap versus the last completed cash close (yesterday on a weekday, Friday on a weekend), buy the discount. Short-horizon off-hour prints on a thin book often reverse; this is the opposite of weekend discovery.",
    when: "Best OPEN per-share is at least the discount below prior cash close, after the multiplier.",
    skip: "Prior close missing. Wrapper at or above that close. Slip above the cap. Queue mode while cash is dark.",
    rails: "Best OPEN rail. Cash-dark books are usually xStock AMM.",
    cadenceHint: "15m",
  },
  {
    id: "open_print",
    jobType: "open_print",
    name: "Cash-open window",
    kicker: "09:30 ET",
    thesis:
      "The cash open is when mint/redeem and RFQ can hedge again, so wrapper-to-cash gaps compress. Inside a short window, buy a still-cheap print versus prior close. A rich open is discovery, not a silent sell.",
    when: "Regular cash session, inside the window after 09:30 ET, gap versus prior close still at or below −minGapPct.",
    skip: "Outside the window. Premium at the open. Friday ref missing. No OPEN rail.",
    rails: "Best OPEN rail, usually Ondo or bStock once US hours bind.",
    cadenceHint: "weekday 09:30 ET",
  },
  {
    id: "flatten_earnings",
    jobType: "flatten_earnings",
    name: "Flatten earnings",
    kicker: "Event",
    thesis:
      "Cut size in the 24 hours before a known print, optionally add on a dip, optionally flatten in the post-market window. Wrappers do not vote and do not halt the way the cash listing does.",
    when: "Print time is set and an OPEN rail exists inside the cut / dip / flatten windows.",
    skip: "No print time. Rail closed. The same leg already sent.",
    rails: "Best OPEN rail. A locked cash-hours rail will wait if 40367/40369.",
    cadenceHint: "around the print",
  },
  {
    id: "session_hours",
    jobType: null,
    name: "Session router",
    kicker: "Hours",
    thesis:
      "Follow the live OPEN book. Cash-open clocks prefer Ondo and bStock when they quote. Cash-dark clocks treat any still-open wrapper as a thin book versus Friday. 40367 and 40369 bind some windows; they do not mean every rail is blank.",
    when: "Always on the desk. It never queues an intent.",
    skip: "Nothing to skip. It is routing copy, not a job.",
    rails: "Whichever wrappers are OPEN on this clock.",
    cadenceHint: "live",
  },
];

export function strategyById(id: string): StrategyCard | undefined {
  return STRATEGY_CATALOG.find((card) => card.id === id);
}

export function snapshotRails(books: RailBook[]): RailSnap[] {
  return books.map((book) => {
    const quote = book.best;
    const open = book.status === "OPEN" && Boolean(quote?.ok) && Boolean(quote && quote.perShare > 0);
    return {
      rail: book.wrapper.rail,
      symbol: book.wrapper.symbol,
      open,
      perShare: open && quote ? quote.perShare : null,
      slipBps50: quote?.slipBps50 ?? 0,
      slipBps500: quote?.slipBps500 ?? 0,
      slipKnown: Boolean(quote?.slipKnown),
      executionMode: quote?.executionMode,
      status: book.status,
    };
  });
}

export function deskSignals(input: {
  ticker: string;
  session: CashSession;
  books: RailBook[];
  fridayClose: number | null;
  fridayOpen?: number | null;
  fridayDate?: string | null;
  priorClose?: number | null;
  priorOpen?: number | null;
  priorDate?: string | null;
  sessionOpen?: number | null;
  sessionOpenDate?: string | null;
  cash?: CashPrints | null;
  now?: Date;
}): DeskSignals {
  const rails = snapshotRails(input.books);
  const open = rails.filter((row) => row.open && row.perShare != null);
  const cheapest = open.length ? [...open].sort((a, b) => (a.perShare as number) - (b.perShare as number))[0] : null;
  const richest = open.length ? [...open].sort((a, b) => (b.perShare as number) - (a.perShare as number))[0] : null;
  let crossRailBps: number | null = null;
  if (cheapest?.perShare && richest?.perShare && cheapest.rail !== richest.rail) {
    crossRailBps = ((richest.perShare - cheapest.perShare) / cheapest.perShare) * 10_000;
  }
  const cash: Pick<CashPrints, "friday" | "prior" | "today"> = input.cash ?? {
    friday:
      input.fridayClose && input.fridayClose > 0
        ? { ticker: input.ticker, open: input.fridayOpen || input.fridayClose, close: input.fridayClose, sessionDate: input.fridayDate || "", source: "quote" }
        : null,
    prior:
      input.priorClose && input.priorClose > 0
        ? { ticker: input.ticker, open: input.priorOpen || input.priorClose, close: input.priorClose, sessionDate: input.priorDate || "", source: "quote" }
        : null,
    today: input.sessionOpen && input.sessionOpen > 0 ? { open: input.sessionOpen, close: null, sessionDate: input.sessionOpenDate || "" } : null,
  };
  const perShare = cheapest?.perShare ?? open[0]?.perShare ?? null;
  const gaps = perShare != null ? cashGaps(perShare, cash) : { vsFriday: null, vsPriorClose: null, vsPriorOpen: null, vsSessionOpen: null };
  const primaryRef = cash.prior?.close ?? input.fridayClose;
  const gapByRail: Partial<Record<Rail, number>> = {};
  for (const row of open) {
    const gap = gapPct(row.perShare as number, primaryRef);
    if (gap != null) gapByRail[row.rail] = gap;
  }
  return {
    ticker: input.ticker.toUpperCase(),
    now: input.now ?? new Date(),
    session: input.session,
    fridayClose: cash.friday?.close ?? input.fridayClose,
    fridayOpen: cash.friday?.open ?? input.fridayOpen ?? null,
    fridayDate: cash.friday?.sessionDate ?? input.fridayDate ?? null,
    priorClose: cash.prior?.close ?? input.priorClose ?? null,
    priorOpen: cash.prior?.open ?? input.priorOpen ?? null,
    priorDate: cash.prior?.sessionDate ?? input.priorDate ?? null,
    sessionOpen: cash.today?.open ?? input.sessionOpen ?? null,
    sessionOpenDate: cash.today?.sessionDate ?? input.sessionOpenDate ?? null,
    rails,
    openRails: open.map((row) => row.rail),
    cheapest,
    richest,
    crossRailBps,
    gapPct: gaps.vsPriorClose ?? gaps.vsFriday,
    gapVsFriday: gaps.vsFriday,
    gapVsPriorClose: gaps.vsPriorClose,
    gapVsPriorOpen: gaps.vsPriorOpen,
    gapVsSessionOpen: gaps.vsSessionOpen,
    gapByRail,
    cashDark: input.session.atmosphere !== "open",
  };
}

const ADVISE_WALLET = "0x0000000000000000000000000000000000000001" as const;

export function contextFromSignals(signals: DeskSignals, wallet: JobContext["wallet"] = ADVISE_WALLET): JobContext {
  const cheap = signals.cheapest;
  return {
    now: signals.now,
    session: signals.session,
    gapPct: signals.gapPct,
    railOpen: signals.openRails.length > 0,
    wallet,
    ticker: signals.ticker,
    rails: signals.rails,
    fridayClose: signals.fridayClose,
    priorClose: signals.priorClose,
    priorOpen: signals.priorOpen,
    priorDate: signals.priorDate,
    fridayDate: signals.fridayDate,
    sessionOpen: signals.sessionOpen,
    gapVsFriday: signals.gapVsFriday,
    gapVsPriorClose: signals.gapVsPriorClose,
    gapVsPriorOpen: signals.gapVsPriorOpen,
    gapVsSessionOpen: signals.gapVsSessionOpen,
    bestRail: cheap?.rail,
    slipBps500: cheap?.slipBps500 ?? null,
    slipKnown: cheap?.slipKnown ?? false,
  };
}

function existingJob(jobs: Job[] | undefined, type: JobType, ticker: string): Job | undefined {
  if (!jobs) return undefined;
  return jobs.find((job) => job.type === type && jobTickers(job).includes(ticker));
}

export function adviseDesk(signals: DeskSignals, jobs?: Job[]): Advice[] {
  const ctx = contextFromSignals(signals);
  const out: Advice[] = [];
  for (const card of STRATEGY_CATALOG) {
    if (card.id === "session_hours") {
      out.push(sessionAdvice(signals, card));
      continue;
    }
    if (card.id === "index_core" && signals.ticker !== "QQQ" && signals.ticker !== "SPY") {
      out.push({
        id: card.id,
        name: card.name,
        status: "info",
        headline: "QQQ · SPY core",
        reason: "Index core arms QQQ and SPY. This name stays on its own jobs.",
        jobType: "dca",
      });
      continue;
    }
    const job = jobFromStrategy(card.id, { ticker: signals.ticker, usdt: "10", id: `advise-${card.id}` });
    if (!job) continue;
    const armed = existingJob(jobs, job.type, signals.ticker);
    const decision = decideJob({ ...job, lastAt: undefined, lastAction: armed?.lastAction }, ctx);
    const queued = decision.intents.length > 0;
    const status: AdviceStatus = queued
      ? "fire"
      : /required|^skip\b/i.test(decision.action)
        ? "skip"
        : "wait";
    const headline = queued
      ? decision.intents[0]
        ? `${decision.intents[0].side} ${decision.intents[0].usdt} ${decision.intents[0].ticker}${decision.intents[0].railLock ? ` · ${decision.intents[0].railLock}` : ""}`
        : decision.action
      : decision.action;
    out.push({
      id: card.id,
      name: card.name,
      status: armed && !queued ? "wait" : status,
      headline,
      reason: armed ? `${decision.action}. Desk already has ${armed.name}.` : decision.action,
      jobType: card.jobType,
    });
  }
  return out;
}

function sessionAdvice(signals: DeskSignals, card: StrategyCard): Advice {
  const open = signals.rails.filter((row) => row.open);
  const names = open.map((row) => row.symbol).join(" · ");
  if (!open.length) {
    return {
      id: card.id,
      name: card.name,
      status: "info",
      headline: signals.cashDark ? "Cash dark · every rail blank" : "Cash live · every rail blank",
      reason: "No executable wrapper. Queue stays queued. The desk will not invent a price.",
      jobType: null,
    };
  }
  if (!signals.cashDark) {
    const rfq = open.filter((row) => row.rail === "ondo" || row.rail === "bStock").map((row) => row.symbol).join(" · ") || names;
    return {
      id: card.id,
      name: card.name,
      status: "info",
      headline: `Cash live · prefer ${rfq}`,
      reason: "Score the OPEN book. Ondo and bStock can hedge into US hours. A closed row stays blank.",
      jobType: null,
    };
  }
  const prior = signals.gapVsPriorClose;
  const friday = signals.gapVsFriday;
  const openPx = signals.gapVsPriorOpen;
  const priorLabel = signals.priorDate ? `prior close ${shortYmd(signals.priorDate)}` : "prior close";
  const bits = [
    prior != null ? `${formatPct(prior)} vs ${priorLabel}` : null,
    openPx != null && signals.priorDate ? `${formatPct(openPx)} vs prior open` : null,
    friday != null && signals.fridayDate && signals.fridayDate !== signals.priorDate ? `${formatPct(friday)} vs Friday` : null,
  ].filter(Boolean);
  return {
    id: card.id,
    name: card.name,
    status: "info",
    headline: bits.length ? `Cash dark · ${names} · ${bits.join(" · ")}` : `Cash dark · ${names} still quoting`,
    reason: "US cash is shut. An open wrapper is a thin book versus the last cash prints, not a new official close. 40367/40369 bind some windows; they are not this clock.",
    jobType: null,
  };
}

export function jobFromStrategy(
  id: StrategyId | string,
  input: { ticker: string; usdt?: string; printAt?: string; id?: string; now?: number; cadence?: string },
): Job | null {
  const card = strategyById(id);
  if (!card || !card.jobType) return null;
  const ticker = input.ticker.toUpperCase();
  const usdt = input.usdt || "10";
  const now = input.now ?? Date.now();
  const jobId = input.id ?? `job-${card.id}-${now}`;
  const cadence = input.cadence;
  if (card.id === "index_core") {
    const preset = presetCron(cadence || "weekday-open");
    const spec: DcaSpec = { tickers: ["QQQ", "SPY"], usdtEach: usdt, cron: preset.cron, rail: "best", maxPremiumPct: 2 };
    return {
      id: jobId,
      name: "DCA QQQ SPY",
      type: "dca",
      paused: false,
      cadence: preset.cadence,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  if (card.jobType === "dca") {
    const preset = presetCron(cadence || "1h");
    const spec: DcaSpec = { tickers: [ticker], usdtEach: usdt, cron: preset.cron, rail: "best", maxPremiumPct: 2 };
    return {
      id: jobId,
      name: `DCA ${ticker}`,
      type: "dca",
      paused: false,
      cadence: preset.cadence,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  if (card.jobType === "cheap_rail") {
    const preset = presetCron(cadence || "15m");
    const spec: CheapRailSpec = { tickers: [ticker], usdtEach: usdt, minBps: 40, maxSlipBps: 80 };
    return {
      id: jobId,
      name: `Cheap rail ${ticker}`,
      type: "cheap_rail",
      paused: false,
      cadence: preset.cadence,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  if (card.jobType === "weekend_cap") {
    const preset = presetCron(cadence || "weekday-open");
    const spec: WeekendCapSpec = { ticker, maxUsdt: usdt, gapPct: 1, mode: "queue_for_cash_open" };
    return {
      id: jobId,
      name: `Weekend ${ticker}`,
      type: "weekend_cap",
      paused: false,
      cadence: spec.mode,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  if (card.jobType === "gap_fade") {
    const preset = presetCron(cadence || "15m");
    const spec: GapFadeSpec = { ticker, usdtEach: usdt, discountPct: 1, mode: "queue_for_cash_open", maxSlipBps: 80 };
    return {
      id: jobId,
      name: `Discount ${ticker}`,
      type: "gap_fade",
      paused: false,
      cadence: spec.mode,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  if (card.jobType === "open_print") {
    const preset = presetCron(cadence || "weekday-open");
    const spec: OpenPrintSpec = { ticker, usdtEach: usdt, minGapPct: 0.5, windowMin: 30, maxSlipBps: 80 };
    return {
      id: jobId,
      name: `Open print ${ticker}`,
      type: "open_print",
      paused: false,
      cadence: preset.cadence,
      cron: preset.cron,
      createdAt: now,
      spec,
    };
  }
  const preset = presetCron(cadence || "1h");
  const spec: FlattenSpec = {
    ticker,
    cutPctBeforePrint: 25,
    dipPct: 3,
    usdtAdd: usdt,
    flattenAfterHours: true,
    printAt: input.printAt,
  };
  return {
    id: jobId,
    name: `Flatten ${ticker}`,
    type: "flatten_earnings",
    paused: false,
    cadence: "around the print",
    cron: preset.cron,
    createdAt: now,
    spec,
  };
}

export function formatAdvice(advice: Advice[]): string[] {
  return advice.map((row) => `${row.name} · ${row.status} · ${row.headline}`);
}

export function defaultQueueMode(mode: string | undefined): QueueMode {
  return mode === "trade_if_open" ? "trade_if_open" : "queue_for_cash_open";
}
