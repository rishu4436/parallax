import type { Rail, Settings } from "./types";
import { RAILS } from "./types";

export function parseSettings(input: Partial<Settings> | null | undefined): Settings {
  const order = Number(input?.orderCapUsdt);
  const daily = Number(input?.dailyCapUsdt);
  if (!Number.isFinite(order) || order <= 0) {
    throw new Error("Order cap must be a number greater than zero.");
  }
  if (!Number.isFinite(daily) || daily <= 0) {
    throw new Error("Daily cap must be a number greater than zero.");
  }
  const raw = Array.isArray(input?.allowedRails) ? input.allowedRails : [];
  const allowedRails = raw.filter((rail): rail is Rail => RAILS.includes(rail as Rail));
  if (!allowedRails.length) throw new Error("At least one rail stays on.");
  const minNet = Number(input?.minNetEdgePct);
  const maxSlip = Number(input?.maxSlipPct);
  const minLiq = Number(input?.minLiquidityUsd);
  return {
    orderCapUsdt: order,
    dailyCapUsdt: daily,
    allowedRails,
    killSwitch: Boolean(input?.killSwitch),
    minNetEdgePct: Number.isFinite(minNet) && minNet >= 0 ? minNet : 0.5,
    maxSlipPct: Number.isFinite(maxSlip) && maxSlip > 0 ? maxSlip : 0.5,
    minLiquidityUsd: Number.isFinite(minLiq) && minLiq >= 0 ? minLiq : 100_000,
    approvalRequired: input?.approvalRequired !== false,
  };
}
