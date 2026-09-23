import { resolveQuery, type ResolveHit } from "./registry";
import type { Intent, Side } from "./types";

export type CommandHit =
  | { type: "ticker"; hit: ResolveHit; label: string }
  | { type: "trade"; side: Side; usdt: string; hit: ResolveHit; label: string }
  | { type: "jump"; target: "portfolio" | "weekend" | "settings" | "tape" | "strategies"; label: string };

const JUMPS: Record<string, "portfolio" | "weekend" | "settings" | "tape" | "strategies"> = {
  portfolio: "portfolio",
  weekend: "weekend",
  settings: "settings",
  tape: "tape",
  strategies: "strategies",
  strategy: "strategies",
};

export function parseCommand(input: string): CommandHit | null {
  const raw = input.trim();
  if (!raw) return null;
  const jump = JUMPS[raw.toLowerCase()];
  if (jump) return { type: "jump", target: jump, label: jump };
  const trade = raw.match(/^(buy|sell)\s+(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (trade) {
    const hit = resolveQuery(trade[3]);
    if (!hit) return null;
    const side = trade[1].toLowerCase() as Side;
    return {
      type: "trade",
      side,
      usdt: trade[2],
      hit,
      label: `${side} ${trade[2]} ${hit.underlying.ticker}${hit.railLock ? ` · ${hit.railLock}` : ""}`,
    };
  }
  const hit = resolveQuery(raw);
  if (!hit) return null;
  return { type: "ticker", hit, label: `${hit.underlying.name} · ${hit.underlying.ticker}` };
}

export function intentFromCommand(cmd: Extract<CommandHit, { type: "trade" }>, wallet: Intent["wallet"]): Intent {
  return {
    ticker: cmd.hit.underlying.ticker,
    side: cmd.side,
    usdt: cmd.usdt,
    railLock: cmd.hit.railLock,
    wallet,
  };
}
