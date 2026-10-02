import { formatPct, formatPx, type MarketStatus, type Rail } from "@parallax/core";

export const RAIL_LABEL: Record<Rail, string> = {
  bStock: "bStocks",
  ondo: "Ondo",
  xStock: "xStocks",
};

export const SESSION_WORD: Record<string, string> = {
  pre: "PRE-MARKET",
  regular: "REGULAR",
  post: "POST-MARKET",
  overnight: "OVERNIGHT",
  weekend: "WEEKEND",
  holiday: "HOLIDAY",
};

export function money(value: number | null | undefined): string {
  return value == null ? "—" : formatPx(value);
}

export function pct(value: number | null | undefined): string {
  return value == null ? "—" : formatPct(value);
}

export function statusWord(status: MarketStatus): string {
  if (status === "OPEN") return "OPEN";
  if (status === "CLOSED") return "MARKET CLOSED";
  if (status === "HALTED") return "MARKET HALTED";
  if (status === "OFFLINE") return "OFFLINE";
  return "NO EXECUTABLE QUOTE";
}
