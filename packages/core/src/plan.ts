import { jobQuoteUsdt, jobTickers } from "./jobs";
import { decideJob } from "./jobs";
import { contextFromSignals, type DeskSignals } from "./strategies";
import type { Job } from "./types";

export type PlanState = "now" | "later" | "blocked";

export interface PlanStep {
  title: string;
  detail: string;
  state: PlanState;
}

export interface StrategyPlan {
  ticker: string;
  headline: string;
  steps: PlanStep[];
}

export function strategyPlan(input: {
  signals: DeskSignals;
  jobs?: Job[];
  orderCapUsdt?: number;
  dailyCapUsdt?: number;
  spentToday?: number;
}): StrategyPlan {
  const ticker = input.signals.ticker.toUpperCase();
  const jobs = (input.jobs || []).filter((job) => jobTickers(job).includes(ticker));
  const steps: PlanStep[] = [sessionStep(input.signals)];
  if (!jobs.length) {
    steps.push({
      title: "No job is armed",
      detail: `Nothing will run for ${ticker} until you arm a strategy or write a rule on Jobs.`,
      state: "later",
    });
  } else {
    for (const job of jobs) {
      steps.push(stepForJob(job, input));
    }
  }
  steps.push({
    title: "You sign",
    detail: "The worker only queues a signature. It does not send the trade.",
    state: "later",
  });
  const now = steps.filter((step) => step.state === "now").length;
  const armed = jobs.filter((job) => !job.paused).length;
  const headline = armed
    ? `${ticker} · ${armed} armed · ${now ? `${now} ready to queue` : "nothing ready this clock"}`
    : `${ticker} · no job armed`;
  return { ticker, headline, steps };
}

export function formatPlan(plan: StrategyPlan): string[] {
  return [plan.headline, ...plan.steps.map((step) => `${step.state} · ${step.title} · ${step.detail}`)];
}

function sessionStep(signals: DeskSignals): PlanStep {
  const open = signals.rails.filter((row) => row.open).map((row) => row.symbol);
  if (!open.length) {
    return {
      title: signals.cashDark ? "Cash is shut and every rail is blank" : "Cash is live and every rail is blank",
      detail: "No price to trade. The desk will not invent one.",
      state: "blocked",
    };
  }
  const gap = signals.gapVsPriorClose;
  const gapText = gap == null ? "prior close unread" : `${gap >= 0 ? "+" : ""}${gap.toFixed(2)}% versus prior close`;
  return {
    title: signals.cashDark ? `Cash is shut · ${open.join(" · ")} still quoting` : `Cash is live · ${open.join(" · ")}`,
    detail: gapText,
    state: "later",
  };
}

function stepForJob(
  job: Job,
  input: { signals: DeskSignals; orderCapUsdt?: number; dailyCapUsdt?: number; spentToday?: number },
): PlanStep {
  const size = Number(jobQuoteUsdt(job));
  if (job.paused) {
    return { title: job.name, detail: "Paused. Resume it on Jobs.", state: "later" };
  }
  if (input.orderCapUsdt != null && Number.isFinite(size) && size > input.orderCapUsdt) {
    return {
      title: job.name,
      detail: `${jobQuoteUsdt(job)} USDT is above the agent order cap of ${input.orderCapUsdt} USDT. This job will not queue.`,
      state: "blocked",
    };
  }
  const spent = input.spentToday || 0;
  if (input.dailyCapUsdt != null && Number.isFinite(size) && spent + size > input.dailyCapUsdt) {
    return {
      title: job.name,
      detail: `The agent daily cap is ${input.dailyCapUsdt} USDT and ${spent.toFixed(2)} is already sent today.`,
      state: "blocked",
    };
  }
  const decision = decideJob({ ...job, lastAt: undefined }, contextFromSignals(input.signals));
  if (decision.intents.length) {
    const intent = decision.intents[0];
    return {
      title: job.name,
      detail: `Queue ${intent.side} ${intent.usdt} USDT ${intent.ticker}${intent.railLock ? ` on ${intent.railLock}` : ""}. ${decision.action}`,
      state: "now",
    };
  }
  return { title: job.name, detail: decision.action, state: decision.retryMs ? "later" : "blocked" };
}
