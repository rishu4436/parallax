import { randomUUID } from "node:crypto";
import { readEnv } from "@parallax/config";
import { evaluatePolicy, policyPublic, type AgentStrategyType, type ArmedStrategy } from "@parallax/core";
import { readArmed, readSettings, spentTodayUsdt, writeArmed, writeWorkerEnabled } from "@parallax/core/persist";
import { fail, readJson } from "@/lib/http";

const NAMES: Record<AgentStrategyType, string> = {
  BASIS_TRADE: "Basis trade",
  CROSS_ARB: "Cross-protocol arb",
  CORRELATION: "Correlation rebalance",
};

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      action?: "arm" | "worker" | "pause";
      enabled?: boolean;
      id?: string;
      paused?: boolean;
      type?: AgentStrategyType;
      assetPairs?: string[];
      targetSpread?: number | string;
      targetPortfolioRatio?: number | string;
      volatilityDriftThreshold?: number | string;
      usdt?: string;
    }>(request);

    if (body.action === "worker") {
      return Response.json({ ok: true, enabled: writeWorkerEnabled(body.enabled !== false) });
    }
    if (body.action === "pause" && body.id) {
      const armed = writeArmed(readArmed().map((row) => (row.id === body.id ? { ...row, paused: Boolean(body.paused) } : row)));
      return Response.json({ ok: true, armed });
    }

    const type = body.type;
    if (type !== "BASIS_TRADE" && type !== "CROSS_ARB" && type !== "CORRELATION") {
      return Response.json({ ok: false, message: "Pick a strategy." });
    }
    const assetPairs = (body.assetPairs || [])
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 6);
    if (!assetPairs.length) return Response.json({ ok: false, message: "Name a ticker." });
    const targetSpread = num(body.targetSpread);
    if (targetSpread == null || targetSpread < 0 || targetSpread > 100) {
      return Response.json({ ok: false, message: "Target spread must be between 0 and 100." });
    }
    const settings = readSettings();
    const usdt = (body.usdt || String(Math.min(10, settings.orderCapUsdt))).trim();
    const env = readEnv();
    const preview = evaluatePolicy({
      source: "strategy",
      mode: "preview",
      intent: {
        ticker: assetPairs[0],
        side: "buy",
        usdt,
        wallet: env.quoteWallet,
        actor: "agent",
      },
      settings,
      spentToday: spentTodayUsdt(),
    });
    if (preview.verdict === "BLOCK") {
      return Response.json({ ok: false, message: preview.primary?.human || "Policy blocked this job.", policy: policyPublic(preview) });
    }

    let ratio: number | undefined;
    let drift: number | undefined;
    if (type === "CORRELATION") {
      ratio = num(body.targetPortfolioRatio) ?? 0.5;
      drift = num(body.volatilityDriftThreshold) ?? targetSpread;
      if (ratio <= 0 || ratio >= 1) return Response.json({ ok: false, message: "Target portfolio ratio must be between 0 and 1." });
      if (drift < 0 || drift > 100) return Response.json({ ok: false, message: "Volatility drift threshold must be between 0 and 100." });
    }

    const existing = readArmed();
    const key = `${type}:${assetPairs.join(",")}`;
    const prior = existing.find((row) => `${row.type}:${row.assetPairs.join(",")}` === key);
    const next: ArmedStrategy = {
      id: prior?.id || randomUUID(),
      type,
      name: NAMES[type],
      assetPairs,
      targetSpread,
      targetPortfolioRatio: ratio,
      volatilityDriftThreshold: drift,
      usdt,
      paused: false,
      createdAt: prior?.createdAt || Date.now(),
      lastAction: prior?.lastAction,
      lastAt: prior?.lastAt,
    };
    writeWorkerEnabled(true);
    const armed = writeArmed([next, ...existing.filter((row) => row.id !== next.id)]);
    return Response.json({ ok: true, armed, enabled: true });
  } catch (err) {
    return fail(err);
  }
}
