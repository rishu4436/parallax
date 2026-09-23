import { matchBasket, splitBasket } from "./baskets";
import { presetCron } from "./jobs";
import { listUnderlyings } from "./registry";
import { jobFromStrategy } from "./strategies";
import type { DcaSpec, GapFadeSpec, Job, OpenPrintSpec, WeekendCapSpec } from "./types";

export type RuleResult = { ok: true; job: Job; summary: string } | { ok: false; message: string };

const TICKERS = () => listUnderlyings().map((item) => item.ticker);

export function parsePlainRule(text: string, now = Date.now()): RuleResult {
  const raw = text.trim();
  if (!raw) return { ok: false, message: "Write a rule. Example: buy 10 NVDA every weekday at the open." };
  const q = raw.toLowerCase();
  const basket = matchBasket(q);
  const tickers = mentionedTickers(raw);
  const names = tickers.length ? tickers : basket?.tickers || [];
  if (!names.length) {
    return { ok: false, message: "Name a ticker in this book, or a basket: AI chips, mega caps, index, consumer." };
  }
  const usdt = amountOf(q);
  const cadence = cadenceOf(q);
  const gap = percentOf(q);
  const ticker = names[0];
  const id = `rule-${now}`;

  if (/flatten|earnings|\bprint\b/.test(q)) {
    const when = dateOf(raw);
    if (!when) return { ok: false, message: "Give the print time as 2026-10-20 16:30." };
    const job = jobFromStrategy("flatten_earnings", { ticker, usdt, printAt: when, id, now });
    if (!job) return { ok: false, message: "Could not build that earnings rule." };
    return { ok: true, job, summary: `Flatten ${ticker} around ${when}. Sell before the print, add on a dip, then flatten after. The worker queues each leg for your signature.` };
  }

  if (/cheaper|cheap rail|cheapest/.test(q)) {
    const job = jobFromStrategy("cheap_rail", { ticker, usdt, cadence, id, now });
    if (!job) return { ok: false, message: "Could not build that cheap-rail rule." };
    return { ok: true, job, summary: `Buy ${usdt} USDT of ${ticker} on the cheaper open rail when two wrappers differ. ${cadenceLabel(cadence)}.` };
  }

  if (/friday|weekend/.test(q)) {
    const job = jobFromStrategy("weekend_cap", { ticker, usdt, id, now });
    if (!job) return { ok: false, message: "Could not build that Friday rule." };
    const spec = job.spec as WeekendCapSpec;
    spec.gapPct = gap;
    spec.mode = /queue|cash open/.test(q) ? "queue_for_cash_open" : "trade_if_open";
    job.cadence = spec.mode;
    return { ok: true, job, summary: `Buy ${usdt} USDT of ${ticker} when it is ${gap}% above Friday's close. ${spec.mode === "queue_for_cash_open" ? "Queue until cash opens." : "Take an open rail."}` };
  }

  if (/below|under|discount|yesterday|prior close/.test(q)) {
    const job = jobFromStrategy("gap_fade", { ticker, usdt, cadence, id, now });
    if (!job) return { ok: false, message: "Could not build that discount rule." };
    const spec = job.spec as GapFadeSpec;
    spec.discountPct = gap;
    spec.mode = /queue|cash open/.test(q) ? "queue_for_cash_open" : "trade_if_open";
    job.cadence = spec.mode;
    return { ok: true, job, summary: `Buy ${usdt} USDT of ${ticker} when it is ${gap}% below the prior cash close. ${spec.mode === "queue_for_cash_open" ? "Queue until cash opens." : "Take an open rail."}` };
  }

  if (/first/.test(q) && /minute|open/.test(q)) {
    const job = jobFromStrategy("open_print", { ticker, usdt, id, now });
    if (!job) return { ok: false, message: "Could not build that open rule." };
    const spec = job.spec as OpenPrintSpec;
    spec.minGapPct = gap;
    const window = q.match(/(\d+)\s*minute/);
    if (window) spec.windowMin = Number(window[1]);
    return { ok: true, job, summary: `In the first ${spec.windowMin} minutes after 09:30 ET, buy ${usdt} USDT of ${ticker} if it is still ${gap}% below the prior close.` };
  }

  const job = jobFromStrategy(names.length > 1 && basket?.id === "index" ? "index_core" : "dca", {
    ticker,
    usdt,
    cadence,
    id,
    now,
  });
  if (!job) return { ok: false, message: "Could not build that buy rule." };
  const spec = job.spec as DcaSpec;
  spec.tickers = names;
  const slices = basket && !tickers.length ? splitBasket(usdt, names) : [];
  spec.usdtEach = slices[0]?.usdt || usdt;
  const preset = presetCron(cadence);
  job.cadence = preset.cadence;
  job.cron = preset.cron;
  spec.cron = preset.cron;
  job.name = names.length > 1 ? `DCA ${names.join(" ")}` : job.name;
  const each = slices.length ? slices.map((slice) => `${slice.ticker} ${slice.usdt}`).join(", ") : `${usdt} USDT of ${names.join(", ")}`;
  return {
    ok: true,
    job,
    summary: `Buy ${each} ${preset.cadence}. Skip a clip that is already rich versus the prior close. The worker queues it. You sign.`,
  };
}

function mentionedTickers(text: string): string[] {
  const upper = text.toUpperCase();
  return TICKERS().filter((ticker) => new RegExp(`\\b${ticker}\\b`).test(upper));
}

function amountOf(text: string): string {
  const re = /(\d+(?:\.\d+)?)(\s*(%|min|mins|minute|minutes))?/gi;
  for (const match of text.matchAll(re)) {
    if (match[3]) continue;
    return match[1];
  }
  return "10";
}

function percentOf(text: string): number {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? Number(match[1]) : 1;
}

function cadenceOf(text: string): string {
  if (/15/.test(text) && /min/.test(text)) return "15m";
  if (/4/.test(text) && /hour/.test(text)) return "4h";
  if (/weekday|9:30|09:30|at the open/.test(text)) return "weekday-open";
  if (/hour/.test(text)) return "1h";
  return "weekday-open";
}

function cadenceLabel(cadence: string): string {
  return presetCron(cadence).cadence;
}

function dateOf(text: string): string | null {
  const match = text.match(/(\d{4}-\d{2}-\d{2})(?:[ t](\d{1,2}:\d{2}))?/);
  if (!match) return null;
  return `${match[1]}T${match[2] || "16:00"}`;
}
