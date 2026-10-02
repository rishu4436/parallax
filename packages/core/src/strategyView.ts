import { jobFromStrategy, STRATEGY_CATALOG, type Advice, type AdviceStatus, type StrategyId } from "./strategies";
import type { AgentStrategyType, Job } from "./types";

export const AGENT_STRATEGY_NAMES: Record<AgentStrategyType, string> = {
  BASIS_TRADE: "Basis Trade",
  CROSS_ARB: "Cross-Protocol Arb",
  CORRELATION: "Correlation Rebalance",
};

export type StrategyPresence = "READY" | "WATCH" | "FIRE" | "WAIT" | "SKIP" | "ARMED" | "PAUSED";

export function strategyPresence(advice: Advice | undefined, job?: { paused: boolean } | null): StrategyPresence {
  if (job?.paused) return "PAUSED";
  if (advice?.status === "fire") return "FIRE";
  if (job && !job.paused) return "ARMED";
  if (advice?.status === "skip") return "SKIP";
  if (advice?.status === "wait") return "WAIT";
  if (advice?.status === "info") return "WATCH";
  return "READY";
}

export function validateStrategyInput(input: { id: string; ticker: string; usdt: string; orderCap?: number }): { ok: true } | { ok: false; message: string } {
  if (input.id === "session_hours") return { ok: false, message: "Session router does not arm a job." };
  const size = Number(input.usdt);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: "Size must be greater than zero." };
  if (input.orderCap != null && size > input.orderCap) return { ok: false, message: `Order cap is ${input.orderCap} USDT.` };
  if (input.id !== "index_core" && !/^[A-Za-z.]{1,12}$/.test(input.ticker.trim())) {
    return { ok: false, message: "Ticker is not valid." };
  }
  return { ok: true };
}

export function previewJob(id: StrategyId, ticker: string, usdt = "10"): Job | null {
  return jobFromStrategy(id, { ticker, usdt, now: 0, id: `preview-${id}` });
}

export function strategyRule(job: Job | null): string | null {
  if (!job) return null;
  const spec = job.spec as {
    minBps?: number;
    maxSlipBps?: number;
    maxPremiumPct?: number;
    discountPct?: number;
    gapPct?: number;
    minGapPct?: number;
    windowMin?: number;
    rail?: string;
  };
  const bits = [
    spec.minBps != null ? `minimum spread ${spec.minBps} bps` : null,
    spec.maxSlipBps != null ? `slip cap ${spec.maxSlipBps} bps` : null,
    spec.maxPremiumPct != null ? `premium cap ${spec.maxPremiumPct}%` : null,
    spec.discountPct != null ? `discount ${spec.discountPct}%` : null,
    spec.gapPct != null ? `Friday gap ${spec.gapPct}%` : null,
    spec.minGapPct != null ? `open gap ${spec.minGapPct}%` : null,
    spec.windowMin != null ? `window ${spec.windowMin} min` : null,
    spec.rail ? `rail ${spec.rail}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

export function adviceTone(status: AdviceStatus | StrategyPresence): "open" | "pending" | "closed" | "failed" {
  if (status === "fire" || status === "FIRE" || status === "ARMED") return "open";
  if (status === "wait" || status === "WAIT" || status === "WATCH" || status === "READY" || status === "info") return "pending";
  if (status === "skip" || status === "SKIP" || status === "PAUSED") return "closed";
  return "failed";
}

export function strategiesLayout(width: number): "stack" | "split" {
  return width >= 900 ? "split" : "stack";
}
