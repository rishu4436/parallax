export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Amount must be a positive decimal. Received ${amount}.`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Amount has more than ${decimals} decimal places.`);
  }
  const base = `${whole}${frac.padEnd(decimals, "0")}`.replace(/^0+/, "") || "0";
  if (base === "0") throw new Error("Amount must be greater than zero.");
  return base;
}

export function fromBaseUnits(amount: string, decimals: number): number {
  if (!amount || amount === "0") return 0;
  const neg = amount.startsWith("-");
  const digits = neg ? amount.slice(1) : amount;
  if (!/^\d+$/.test(digits)) return Number.NaN;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals, padded.length - decimals + 10);
  const n = Number(`${whole}.${frac}`);
  return neg ? -n : n;
}

export function formatUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = n >= 1000 ? 2 : n >= 1 ? 2 : 4;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function formatUsdt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
}

export function formatBps(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)} bps`;
}

export function formatLiq(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatTtl(leftoverMs: number): string {
  if (!Number.isFinite(leftoverMs) || leftoverMs <= 0) return "00:00";
  const s = Math.ceil(leftoverMs / 1000);
  return `00:${String(s).padStart(2, "0")}`;
}

export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return "now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export function quoteFreshness(quoteExpiresAt: number, now = Date.now()): {
  stale: boolean;
  leftoverMs: number;
  label: string;
} {
  const leftoverMs = quoteExpiresAt - now;
  const stale = leftoverMs <= 0;
  return {
    stale,
    leftoverMs: Math.max(0, leftoverMs),
    label: stale ? "QUOTE STALE" : formatTtl(leftoverMs),
  };
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
