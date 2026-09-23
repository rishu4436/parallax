import type {
  CheapRailSpec,
  DcaSpec,
  ExecMode,
  FlattenSpec,
  GapFadeSpec,
  Intent,
  Job,
  OpenPrintSpec,
  Rail,
  RailStatus,
  WeekendCapSpec,
} from "./types";
import type { CashSession } from "./session";

export function presetCron(preset: string): { cron: string; cadence: string; everyMs: number } {
  switch (preset) {
    case "15m":
      return { cron: "*/15 * * * *", cadence: "every 15m", everyMs: 15 * 60_000 };
    case "1h":
      return { cron: "0 * * * *", cadence: "hourly", everyMs: 60 * 60_000 };
    case "4h":
      return { cron: "0 */4 * * *", cadence: "every 4h", everyMs: 4 * 60 * 60_000 };
    case "weekday-open":
      return { cron: "30 9 * * 1-5", cadence: "weekdays 09:30 ET", everyMs: 24 * 60 * 60_000 };
    default:
      return { cron: preset, cadence: preset, everyMs: 60 * 60_000 };
  }
}

export function jobIntervalMs(cron: string): number {
  if (cron.startsWith("*/")) {
    const n = Number(cron.split(" ")[0].slice(2));
    if (n > 0) return n * 60_000;
  }
  if (cron.startsWith("0 */")) {
    const n = Number(cron.split(" ")[1].slice(2));
    if (n > 0) return n * 60 * 60_000;
  }
  if (cron.startsWith("30 9")) return 24 * 60 * 60_000;
  if (cron.startsWith("0 *")) return 60 * 60_000;
  return 60 * 60_000;
}

export function jobDue(job: Job, now: number): boolean {
  if (job.paused) return false;
  if (!job.lastAt) return true;
  return now - job.lastAt >= jobIntervalMs(job.cron);
}

/** Soft misses retry in two minutes. A queued intent consumes the full cadence. */
export const JOB_RETRY_MS = 120_000;

export function jobTickers(job: Job): string[] {
  if (job.type === "dca") return (job.spec as DcaSpec).tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean);
  if (job.type === "cheap_rail") return (job.spec as CheapRailSpec).tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean);
  if (job.type === "weekend_cap") return [(job.spec as WeekendCapSpec).ticker.toUpperCase()].filter(Boolean);
  if (job.type === "gap_fade") return [(job.spec as GapFadeSpec).ticker.toUpperCase()].filter(Boolean);
  if (job.type === "open_print") return [(job.spec as OpenPrintSpec).ticker.toUpperCase()].filter(Boolean);
  return [(job.spec as FlattenSpec).ticker.toUpperCase()].filter(Boolean);
}

export function jobQuoteUsdt(job: Job): string {
  if (job.type === "dca") return (job.spec as DcaSpec).usdtEach;
  if (job.type === "weekend_cap") return (job.spec as WeekendCapSpec).maxUsdt;
  if (job.type === "cheap_rail") return (job.spec as CheapRailSpec).usdtEach;
  if (job.type === "gap_fade") return (job.spec as GapFadeSpec).usdtEach;
  if (job.type === "open_print") return (job.spec as OpenPrintSpec).usdtEach;
  return (job.spec as FlattenSpec).usdtAdd;
}

export function jobRailLock(job: Job): Rail | undefined {
  if (job.type !== "dca") return undefined;
  const rail = (job.spec as DcaSpec).rail;
  return rail === "best" ? undefined : rail;
}

export interface RailSnap {
  rail: Rail;
  symbol: string;
  open: boolean;
  perShare: number | null;
  slipBps50: number;
  slipBps500: number;
  slipKnown: boolean;
  executionMode?: ExecMode;
  status: RailStatus;
}

export interface JobContext {
  now: Date;
  session: CashSession;
  gapPct: number | null;
  railOpen: boolean;
  wallet: `0x${string}`;
  /** Ticker being evaluated. DCA jobs are called once per ticker. */
  ticker: string;
  lastAction?: string;
  rails?: RailSnap[];
  fridayClose?: number | null;
  priorClose?: number | null;
  priorOpen?: number | null;
  priorDate?: string | null;
  fridayDate?: string | null;
  sessionOpen?: number | null;
  gapVsFriday?: number | null;
  gapVsPriorClose?: number | null;
  gapVsPriorOpen?: number | null;
  gapVsSessionOpen?: number | null;
  bestRail?: Rail;
  slipBps500?: number | null;
  slipKnown?: boolean;
}

function fridayGap(ctx: JobContext): number | null {
  return ctx.gapVsFriday ?? ctx.gapPct;
}

function priorGap(ctx: JobContext): number | null {
  return ctx.gapVsPriorClose ?? ctx.gapPct;
}

export interface JobDecision {
  intents: Intent[];
  action: string;
  /** Null consumes the full cadence. A number retries after that many milliseconds. */
  retryMs: number | null;
}

/** The worker may emit intents. It never signs. */
export function decideJob(job: Job, ctx: JobContext): JobDecision {
  if (!jobDue(job, ctx.now.getTime())) {
    return { intents: [], action: job.lastAction || "waiting for the cadence", retryMs: null };
  }
  if (job.type === "dca") return decideDca(job.spec as DcaSpec, ctx);
  if (job.type === "weekend_cap") return decideWeekend(job.spec as WeekendCapSpec, ctx);
  if (job.type === "cheap_rail") return decideCheapRail(job.spec as CheapRailSpec, ctx);
  if (job.type === "gap_fade") return decideGapFade(job.spec as GapFadeSpec, ctx);
  if (job.type === "open_print") return decideOpenPrint(job.spec as OpenPrintSpec, ctx);
  return decideFlatten(job.spec as FlattenSpec, ctx);
}

function slipBlocked(maxSlipBps: number | undefined, slipBps500: number | null | undefined, slipKnown: boolean | undefined): JobDecision | null {
  if (maxSlipBps == null || !slipKnown || slipBps500 == null) return null;
  if (slipBps500 <= maxSlipBps) return null;
  return { intents: [], action: `slip ${slipBps500} bps exceeds ${maxSlipBps}`, retryMs: JOB_RETRY_MS };
}

function buy(ctx: JobContext, ticker: string, usdt: string, note: string, railLock?: Rail): JobDecision {
  return {
    intents: [{ ticker: ticker.toUpperCase(), side: "buy", usdt, railLock, wallet: ctx.wallet }],
    action: note,
    retryMs: null,
  };
}

function decideDca(spec: DcaSpec, ctx: JobContext): JobDecision {
  if (!ctx.railOpen) return { intents: [], action: `${ctx.ticker} has no open rail`, retryMs: JOB_RETRY_MS };
  const gap = priorGap(ctx);
  if (spec.maxPremiumPct != null && gap != null && gap > spec.maxPremiumPct) {
    return {
      intents: [],
      action: `skip · prior close gap ${gap.toFixed(2)}% is above the ${spec.maxPremiumPct}% premium cap`,
      retryMs: JOB_RETRY_MS,
    };
  }
  return buy(
    ctx,
    ctx.ticker,
    spec.usdtEach,
    `queued buy ${spec.usdtEach} ${ctx.ticker}`,
    spec.rail === "best" ? undefined : spec.rail,
  );
}

function decideWeekend(spec: WeekendCapSpec, ctx: JobContext): JobDecision {
  const gap = fridayGap(ctx);
  if (gap == null) return { intents: [], action: "Friday ref unavailable", retryMs: JOB_RETRY_MS };
  if (gap <= spec.gapPct) {
    return { intents: [], action: `Friday gap ${gap.toFixed(2)}% is inside the ${spec.gapPct}% cap`, retryMs: JOB_RETRY_MS };
  }
  if (spec.mode === "queue_for_cash_open" && ctx.session.atmosphere !== "open") {
    return { intents: [], action: "waiting for cash open", retryMs: JOB_RETRY_MS };
  }
  if (!ctx.railOpen) return { intents: [], action: "no open rail", retryMs: JOB_RETRY_MS };
  return {
    intents: [
      {
        ticker: spec.ticker.toUpperCase(),
        side: "buy",
        usdt: spec.maxUsdt,
        wallet: ctx.wallet,
      },
    ],
    action: `queued buy ${spec.maxUsdt} ${spec.ticker} · Friday gap ${gap.toFixed(2)}%`,
    retryMs: null,
  };
}

function decideCheapRail(spec: CheapRailSpec, ctx: JobContext): JobDecision {
  const open = (ctx.rails ?? []).filter((row) => row.open && row.perShare != null && row.perShare > 0);
  if (open.length < 2) return { intents: [], action: `${ctx.ticker} needs two open rails`, retryMs: JOB_RETRY_MS };
  const ranked = [...open].sort((a, b) => (a.perShare as number) - (b.perShare as number));
  const cheap = ranked[0];
  const rich = ranked[ranked.length - 1];
  const spreadBps = ((rich.perShare as number) - (cheap.perShare as number)) / (cheap.perShare as number) * 10_000;
  if (spreadBps < spec.minBps) {
    return {
      intents: [],
      action: `spread ${spreadBps.toFixed(0)} bps is inside the ${spec.minBps} bps floor`,
      retryMs: JOB_RETRY_MS,
    };
  }
  const blocked = slipBlocked(spec.maxSlipBps, cheap.slipBps500, cheap.slipKnown);
  if (blocked) return blocked;
  return buy(
    ctx,
    ctx.ticker,
    spec.usdtEach,
    `queued buy ${spec.usdtEach} ${ctx.ticker} · ${cheap.symbol} cheaper by ${spreadBps.toFixed(0)} bps`,
    cheap.rail,
  );
}

function decideGapFade(spec: GapFadeSpec, ctx: JobContext): JobDecision {
  const gap = priorGap(ctx);
  if (gap == null) return { intents: [], action: "prior cash close unavailable", retryMs: JOB_RETRY_MS };
  if (gap > -Math.abs(spec.discountPct)) {
    return {
      intents: [],
      action: `prior close gap ${gap.toFixed(2)}% is not a ${spec.discountPct}% discount`,
      retryMs: JOB_RETRY_MS,
    };
  }
  if (spec.mode === "queue_for_cash_open" && ctx.session.atmosphere !== "open") {
    return { intents: [], action: "waiting for cash open", retryMs: JOB_RETRY_MS };
  }
  if (!ctx.railOpen) return { intents: [], action: "no open rail", retryMs: JOB_RETRY_MS };
  const blocked = slipBlocked(spec.maxSlipBps, ctx.slipBps500, ctx.slipKnown);
  if (blocked) return blocked;
  return buy(
    ctx,
    spec.ticker,
    spec.usdtEach,
    `queued buy ${spec.usdtEach} ${spec.ticker} · prior close discount ${gap.toFixed(2)}%`,
  );
}

function decideOpenPrint(spec: OpenPrintSpec, ctx: JobContext): JobDecision {
  const et = ctx.session.et;
  if (!et) return { intents: [], action: "cash clock unread", retryMs: JOB_RETRY_MS };
  if (ctx.session.kind !== "regular" || ctx.session.atmosphere !== "open") {
    return { intents: [], action: "waiting for the cash-open window", retryMs: JOB_RETRY_MS };
  }
  const mins = et.hour * 60 + et.minute - (9 * 60 + 30);
  if (mins < 0 || mins > spec.windowMin) {
    return { intents: [], action: `outside the ${spec.windowMin}m cash-open window`, retryMs: JOB_RETRY_MS };
  }
  const stamp = `print sent · ${et.ymd}`;
  if ((ctx.lastAction || "").includes(stamp)) {
    return { intents: [], action: "open print already sent today", retryMs: JOB_RETRY_MS };
  }
  const gap = priorGap(ctx);
  if (gap == null) return { intents: [], action: "prior cash close unavailable", retryMs: JOB_RETRY_MS };
  if (gap > -Math.abs(spec.minGapPct)) {
    return {
      intents: [],
      action: `open gap vs prior close ${gap.toFixed(2)}% is not a ${spec.minGapPct}% discount`,
      retryMs: JOB_RETRY_MS,
    };
  }
  if (!ctx.railOpen) return { intents: [], action: "no open rail", retryMs: JOB_RETRY_MS };
  const blocked = slipBlocked(spec.maxSlipBps, ctx.slipBps500, ctx.slipKnown);
  if (blocked) return blocked;
  return buy(ctx, spec.ticker, spec.usdtEach, `${stamp} · buy ${spec.usdtEach} ${spec.ticker} · prior close ${gap.toFixed(2)}%`);
}

function decideFlatten(spec: FlattenSpec, ctx: JobContext): JobDecision {
  if (!spec.printAt) return { intents: [], action: "earnings print time required", retryMs: JOB_RETRY_MS };
  const print = new Date(spec.printAt).getTime();
  if (!Number.isFinite(print)) return { intents: [], action: "print time is not a valid date", retryMs: JOB_RETRY_MS };
  const hoursTo = (print - ctx.now.getTime()) / 3_600_000;
  const acted = ctx.lastAction || "";
  const dipGap = priorGap(ctx);
  const sell = (note: string): JobDecision => ({
    intents: [{ ticker: spec.ticker.toUpperCase(), side: "sell", usdt: spec.usdtAdd, wallet: ctx.wallet }],
    action: note,
    retryMs: null,
  });
  if (hoursTo > 0 && hoursTo <= 24 && !acted.includes("cut sent")) {
    if (!ctx.railOpen) return { intents: [], action: "cut is waiting for an open rail", retryMs: JOB_RETRY_MS };
    return sell(`cut sent · sell ${spec.usdtAdd} USDT notional · ${spec.cutPctBeforePrint}% requested`);
  }
  if (
    dipGap != null &&
    dipGap <= -Math.abs(spec.dipPct) &&
    hoursTo < 24 &&
    hoursTo > -12 &&
    !acted.includes("dip sent")
  ) {
    if (!ctx.railOpen) return { intents: [], action: "dip buy is waiting for an open rail", retryMs: JOB_RETRY_MS };
    return {
      intents: [{ ticker: spec.ticker.toUpperCase(), side: "buy", usdt: spec.usdtAdd, wallet: ctx.wallet }],
      action: `dip sent · buy ${spec.usdtAdd} after prior close ${dipGap.toFixed(2)}%`,
      retryMs: null,
    };
  }
  if (spec.flattenAfterHours && hoursTo <= 0 && hoursTo > -12 && ctx.session.kind === "post" && !acted.includes("flatten sent")) {
    if (!ctx.railOpen) return { intents: [], action: "flatten is waiting for an open rail", retryMs: JOB_RETRY_MS };
    return sell(`flatten sent · sell ${spec.usdtAdd} USDT notional`);
  }
  if (hoursTo > 24) return { intents: [], action: "waiting for the 24h window before the print", retryMs: JOB_RETRY_MS };
  return { intents: [], action: "no flatten action in this window", retryMs: JOB_RETRY_MS };
}

export function nextLastAt(now: number, cron: string, retryMs: number | null): number {
  if (retryMs == null) return now;
  return now - jobIntervalMs(cron) + retryMs;
}
