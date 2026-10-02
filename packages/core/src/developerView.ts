export type DevOperation = "read" | "simulation" | "prepare" | "execution" | "unknown";

export interface ObservedCall {
  at: string;
  path: string;
  group: string;
  operation: DevOperation;
  status: number | null;
  latencyMs: number | null;
  retries: number | null;
  ok: boolean | null;
  errorCode: number | null;
  note: string | null;
  kind: string;
}

export interface DeveloperStats {
  count: number;
  success: number;
  failure: number;
  medianMs: number | null;
  p95Ms: number | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface DeveloperApiRow {
  group: string;
  name: string;
  path: string;
  purpose: string;
  operation: DevOperation;
}

/** Rows that map to call sites already in the repo. */
export const DEVELOPER_APIS: DeveloperApiRow[] = [
  { group: "RWA Data", name: "RWA price", path: "/api/v1/dex/market/rwa/price", purpose: "On-chain token price and reference print", operation: "read" },
  { group: "RWA Data", name: "Underlying market", path: "/api/v1/dex/market/rwa/underlying-market", purpose: "Cash session prints for the underlying", operation: "read" },
  { group: "Quote / Routing", name: "Aggregator quote", path: "/api/v1/dex/aggregator/quote", purpose: "Live executable route quote", operation: "read" },
  { group: "Transaction Preparation", name: "Aggregator swap", path: "/api/v1/dex/aggregator/swap", purpose: "Build the unsigned swap", operation: "prepare" },
  { group: "Transaction Preparation", name: "Approve transaction", path: "/api/v1/dex/aggregator/approve-transaction", purpose: "Build an allowance transaction", operation: "prepare" },
  { group: "Simulation", name: "Pre-transaction simulate", path: "/api/v1/dex/pre-transaction/simulate", purpose: "Dry-run an unsigned transaction", operation: "simulation" },
  { group: "Transaction Submission", name: "Broadcast", path: "/api/v1/dex/pre-transaction/broadcast-transaction", purpose: "Submit a signed transaction", operation: "execution" },
  { group: "Transaction Submission", name: "RFQ submit", path: "/api/v1/dex/aggregator/order/submit", purpose: "Submit a signed RFQ", operation: "execution" },
  { group: "Wallet / Balances", name: "Token balances", path: "/api/v1/dex/balance/token-balances-by-address", purpose: "Read token balances", operation: "read" },
  { group: "Market Data", name: "Desk quote", path: "/api/quote", purpose: "Parallax quote, passport, and policy preview", operation: "read" },
  { group: "Quote / Routing", name: "Scan", path: "/api/scan", purpose: "Quote every seeded rail", operation: "read" },
  { group: "Simulation", name: "Prepare", path: "/api/prepare", purpose: "Simulate and build the signing payload", operation: "simulation" },
  { group: "Transaction Submission", name: "Desk broadcast", path: "/api/broadcast", purpose: "Broadcast after commitment check", operation: "execution" },
  { group: "Transaction Submission", name: "Desk RFQ", path: "/api/rfq", purpose: "Submit RFQ after commitment check", operation: "execution" },
  { group: "Agentic Wallet", name: "Agentic status", path: "/api/agentic", purpose: "Read the baw session", operation: "read" },
  { group: "Agent Studio", name: "Desk ping", path: "/api/desk", purpose: "Desk state, including the Studio ping", operation: "read" },
  { group: "Internal application APIs", name: "Activity", path: "/api/activity", purpose: "Read stored tape, passports, and receipts", operation: "read" },
];

export function classifyPath(path: string): { group: string; operation: DevOperation; path: string } {
  const clean = path.split("?")[0] || path;
  const known = DEVELOPER_APIS.find((row) => clean.includes(row.path));
  if (known) return { group: known.group, operation: known.operation, path: clean };
  if (clean.includes("/simulate")) return { group: "Simulation", operation: "simulation", path: clean };
  if (clean.includes("/broadcast") || clean.includes("/order/submit")) return { group: "Transaction Submission", operation: "execution", path: clean };
  if (clean.includes("/swap") || clean.includes("/approve")) return { group: "Transaction Preparation", operation: "prepare", path: clean };
  if (clean.includes("/quote") || clean.includes("/rwa/")) return { group: "Quote / Routing", operation: "read", path: clean };
  return { group: "Internal application APIs", operation: "unknown", path: clean };
}

export function observeCall(input: {
  at: string;
  path: string;
  kind?: string;
  status?: number;
  ttfbMs?: number;
  retries?: number;
  ok?: boolean;
  errorCode?: number;
  note?: string;
}): ObservedCall {
  const classified = classifyPath(input.path);
  return {
    at: input.at,
    path: classified.path,
    group: classified.group,
    operation: classified.operation,
    status: input.status ?? null,
    latencyMs: input.ttfbMs ?? null,
    retries: input.retries ?? null,
    ok: input.ok ?? null,
    errorCode: input.errorCode ?? null,
    note: input.note ?? null,
    kind: input.kind || "latency",
  };
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length < 20) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1);
  return sorted[index];
}

export function developerStats(calls: ObservedCall[]): DeveloperStats {
  const finished = calls.filter((call) => call.kind !== "rate_limit");
  const success = finished.filter((call) => call.ok === true || (call.ok == null && call.status != null && call.status > 0 && call.status < 400));
  const failure = finished.filter((call) => call.ok === false || (call.ok == null && call.status != null && (call.status === 0 || call.status >= 400)));
  const samples = finished.map((call) => call.latencyMs).filter((value): value is number => value != null);
  const medianMs = samples.length ? [...samples].sort((a, b) => a - b)[Math.floor((samples.length - 1) / 2)] : null;
  const lastOk = [...success].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const lastError = [...failure].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  return {
    count: finished.length,
    success: success.length,
    failure: failure.length,
    medianMs,
    p95Ms: percentile(samples, 0.95),
    lastOkAt: lastOk?.at ?? null,
    lastErrorAt: lastError?.at ?? null,
    lastError: lastError?.note || (lastError?.errorCode != null ? String(lastError.errorCode) : null),
  };
}

export function developerErrors(calls: ObservedCall[]): ObservedCall[] {
  return calls.filter((call) => call.ok === false || call.kind === "rate_limit" || (call.status != null && call.status >= 400));
}

export const ERROR_CLASSES = [
  "timeout",
  "http",
  "provider",
  "validation",
  "policy",
  "quote_expiry",
  "signature",
  "wallet",
  "agentic",
  "studio",
  "simulation",
  "unknown",
] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

const PROVIDER_CODES = new Set([40365, 40366, 40367, 40368, 40369, 40370, 40374, 40375, 40441, 40462]);

export function classifyError(call: ObservedCall): ErrorClass | null {
  const failed = call.ok === false || call.kind === "rate_limit" || (call.status != null && (call.status === 0 || call.status >= 400));
  if (!failed) return null;
  const note = (call.note || "").toLowerCase();
  if (note.includes("timeout")) return "timeout";
  if (call.errorCode === 40401 || note.includes("quote expired") || note.includes("quote_expired")) return "quote_expiry";
  if (call.errorCode === 40102 || note.includes("signature")) return "signature";
  if (note.includes("unconnected") || note.includes("wallet unavailable") || note.includes("wallet is locked")) return "wallet";
  if (call.path.includes("agentic") || note.includes("baw")) return "agentic";
  if (note.includes("studio")) return "studio";
  if (call.operation === "simulation" && call.ok === false) return "simulation";
  if (note.includes("kill switch") || note.includes("policy")) return "policy";
  if (call.errorCode === 40001 || note.includes("invalid") || note.includes("required")) return "validation";
  if (call.errorCode != null && PROVIDER_CODES.has(call.errorCode)) return "provider";
  if (call.status != null && call.status >= 400) return "http";
  if (call.status === 0 && note.includes("network")) return "unknown";
  return "unknown";
}

export interface ErrorGroup {
  category: ErrorClass;
  count: number;
  latestAt: string;
  message: string | null;
  path: string | null;
}

export function groupErrors(calls: ObservedCall[]): ErrorGroup[] {
  const groups = new Map<ErrorClass, ErrorGroup>();
  for (const call of developerErrors(calls)) {
    const category = classifyError(call);
    if (!category) continue;
    const current = groups.get(category);
    const newer = !current || call.at > current.latestAt;
    groups.set(category, {
      category,
      count: (current?.count || 0) + 1,
      latestAt: newer ? call.at : current.latestAt,
      message: newer ? call.note : current.message,
      path: newer ? call.path : current.path,
    });
  }
  return [...groups.values()];
}

export interface Reliability {
  observed: boolean;
  count: number;
  successRate: number | null;
  errorRate: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  timeouts: number | null;
  retries: number | null;
  quoteExpiries: number | null;
}

export function reliability(calls: ObservedCall[]): Reliability {
  const stats = developerStats(calls);
  if (stats.count === 0) {
    return { observed: false, count: 0, successRate: null, errorRate: null, medianMs: null, p95Ms: null, timeouts: null, retries: null, quoteExpiries: null };
  }
  const retries = calls.some((call) => call.retries != null) ? calls.reduce((sum, call) => sum + (call.retries || 0), 0) : null;
  const groups = groupErrors(calls);
  return {
    observed: true,
    count: stats.count,
    successRate: stats.count >= 5 ? stats.success / stats.count : null,
    errorRate: stats.count >= 5 ? stats.failure / stats.count : null,
    medianMs: stats.medianMs,
    p95Ms: stats.p95Ms,
    timeouts: groups.find((group) => group.category === "timeout")?.count ?? 0,
    retries,
    quoteExpiries: groups.find((group) => group.category === "quote_expiry")?.count ?? 0,
  };
}

export interface Finding {
  observation: string;
  evidence: string;
  impact: string;
  request: string;
}

export function integrationFindings(calls: ObservedCall[], cards: Array<{ gasEstimateUsd?: number | null; priceImpactPct?: number | null; networkFeeUsd?: number | null; liquidity?: number; slipKnown?: boolean; errorText?: string }> = []): Finding[] {
  const findings: Finding[] = [];
  const hours = calls.filter((call) => call.errorCode === 40367 || call.errorCode === 40369);
  if (hours.length) {
    findings.push({
      observation: "Quote calls returned a cash-hours block.",
      evidence: `${hours.length} observed requests with code ${hours[hours.length - 1]?.errorCode}.`,
      impact: "A closed rail is not an executable quote. Other rails may still be open.",
      request: "Expose a per-rail market state beside the error code.",
    });
  }
  const missingGas = cards.filter((card) => card.networkFeeUsd != null && card.gasEstimateUsd == null);
  if (missingGas.length) {
    findings.push({
      observation: "A network fee was present without a separate gas USD estimate.",
      evidence: `${missingGas.length} scan cards have networkFeeUsd and gasEstimateUsd null.`,
      impact: "Parallax cannot show a dollar gas estimate without inventing one from the trade fee.",
      request: "Expose gasEstimateUsd independently of tradeFee.",
    });
  }
  const missingImpact = cards.filter((card) => card.priceImpactPct == null && card.networkFeeUsd != null);
  if (missingImpact.length) {
    findings.push({
      observation: "Price impact was not on the quote.",
      evidence: `${missingImpact.length} scan cards have priceImpactPct null.`,
      impact: "The desk cannot treat slippage basis points as price impact.",
      request: "Always return priceImpactPercent when the route has one.",
    });
  }
  if (calls.length > 0 && calls.length < 20) {
    findings.push({
      observation: "p95 latency is unavailable.",
      evidence: `${calls.length} latency samples. p95 needs 20.`,
      impact: "The console will not invent a percentile from a short sample.",
      request: "Keep the sample threshold. Do not display a percentile below it.",
    });
  }
  return findings;
}
