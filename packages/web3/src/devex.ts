import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";

export interface DevexEvent {
  at: string;
  kind: "latency" | "rate_limit" | "slippage";
  path: string;
  ttfbMs?: number;
  status?: number;
  backoffMs?: number;
  recovered?: boolean;
  quotePerShare?: number;
  executedPerShare?: number;
  slipBps?: number;
  note?: string;
}

interface DevexFile {
  updatedAt: string;
  events: DevexEvent[];
}

function metricsPath(): string {
  const dir = readEnv().dataDir;
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "devex_metrics.json");
}

let chain: Promise<void> = Promise.resolve();

export function recordDevex(event: DevexEvent): void {
  chain = chain
    .then(async () => {
      const file = metricsPath();
      let current: DevexFile = { updatedAt: "", events: [] };
      if (existsSync(file)) {
        try {
          current = JSON.parse(readFileSync(file, "utf8")) as DevexFile;
        } catch {
          current = { updatedAt: "", events: [] };
        }
      }
      const events = [...(Array.isArray(current.events) ? current.events : []), event].slice(-200);
      const next: DevexFile = { updatedAt: event.at, events };
      writeFileSync(file, JSON.stringify(next, null, 2));
    })
    .catch(() => undefined);
}

export function recordSlippage(input: {
  path: string;
  quotePerShare: number;
  executedPerShare: number;
  note?: string;
}): void {
  if (!(input.quotePerShare > 0) || !(input.executedPerShare > 0)) return;
  const slipBps = Math.round(((input.executedPerShare - input.quotePerShare) / input.quotePerShare) * 10_000);
  recordDevex({
    at: new Date().toISOString(),
    kind: "slippage",
    path: input.path,
    quotePerShare: input.quotePerShare,
    executedPerShare: input.executedPerShare,
    slipBps,
    note: input.note,
  });
}
