import type { CashSession } from "./session";
import { formatPct } from "./amounts";

export interface HoldingGap {
  symbol: string;
  tradable: boolean;
  gapPct: number | null;
}

export function weekendBrief(session: CashSession, holdings: HoldingGap[]): string[] {
  const tradable = holdings.filter((h) => h.tradable).length;
  const gaps = holdings.map((h) => h.gapPct).filter((n): n is number => n != null);
  const median = gaps.length ? medianOf(gaps) : null;
  const closed = session.atmosphere === "closed";
  const lines = [
    closed
      ? "Cash is dark. On-chain wrappers do not inherit the closing bell."
      : "Cash is live. The gap is compressed toward the print.",
    holdings.length
      ? `${tradable} of ${holdings.length} holdings tradable on an open rail.`
      : "No wrappers in the wallet yet. A quote is not a position.",
    median == null
      ? "Friday ref unavailable, so the median gap stays blank."
      : `Median gap vs Friday ${formatPct(median)}.`,
  ];
  return lines;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function cashDarkLabel(session: CashSession): string {
  if (session.atmosphere === "open") return "Cash live · gap compressed";
  const ms = Math.max(0, session.countdownMs);
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `Cash dark ${h}:${String(m).padStart(2, "0")}`;
}
