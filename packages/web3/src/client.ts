import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";
import { recordDevex } from "./devex";

export class Web3ApiError extends Error {
  code: number;
  body: unknown;
  httpStatus: number;
  constructor(code: number, message: string, body: unknown, httpStatus = 0) {
    super(message);
    this.name = "Web3ApiError";
    this.code = code;
    this.body = body;
    this.httpStatus = httpStatus;
  }
}

export function isWeb3Error(err: unknown): err is Web3ApiError {
  return err instanceof Web3ApiError;
}

function successCode(code: unknown, success: unknown): boolean {
  if (success === false) return false;
  if (code === undefined || code === null || code === "") return success === true;
  const n = Number(code);
  return n === 0 || n === 200;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 350;
export const MAX_WEB3_IN_FLIGHT = 3;

export function shouldRetryHttp(status: number): boolean {
  if (status === 429) return true;
  return status >= 500 && status <= 599;
}

let inFlight = 0;
const slotQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_WEB3_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    slotQueue.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = slotQueue.shift();
  if (next) next();
}

/** 350ms, then 700ms, then 1400ms, plus up to 30% jitter so a burst does not retry in lockstep. */
export function retryDelay(attempt: number): number {
  const base = INITIAL_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.floor(Math.random() * Math.floor(base * 0.3));
  return base + jitter;
}

export async function web3Fetch(
  method: "GET" | "POST",
  apiPath: string,
  opts?: { query?: Record<string, string | number | boolean | undefined | null>; body?: unknown },
): Promise<{ data: unknown; raw: unknown; ms: number }> {
  const env = readEnv();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(opts?.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  const pathWithQuery = qs ? `${apiPath}?${qs}` : apiPath;
  const bodyText = opts?.body === undefined ? "" : JSON.stringify(opts.body);
  let waited = 0;
  await acquireSlot();
  try {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const timestamp = new Date().toISOString();
    const prehash = `${timestamp}${method}/build${pathWithQuery}${bodyText}`;
    const signature = createHmac("sha256", env.web3ApiSecret).update(prehash).digest("base64");
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${env.web3ApiBase}${pathWithQuery}`, {
        method,
        headers: {
          "X-OC-APIKEY": env.web3ApiKey,
          "X-OC-TIMESTAMP": timestamp,
          "X-OC-SIGN": signature,
          "X-OC-RECV-WINDOW": "15000",
          "X-OC-NONCE": randomUUID(),
          ...(bodyText ? { "content-type": "application/json" } : {}),
        },
        body: bodyText || undefined,
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const wait = retryDelay(attempt);
        waited += wait;
        recordDevex({
          at: new Date().toISOString(),
          kind: "rate_limit",
          path: pathWithQuery,
          status: 0,
          ttfbMs: Date.now() - started,
          backoffMs: wait,
          recovered: false,
          note: `retry ${attempt + 1} of ${MAX_RETRIES} after network error`,
        });
        await sleep(wait);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Web3ApiError(0, message, null, 0);
    }
    const ttfbMs = Date.now() - started;
    if (shouldRetryHttp(res.status) && attempt < MAX_RETRIES) {
      const wait = retryDelay(attempt);
      waited += wait;
      recordDevex({
        at: new Date().toISOString(),
        kind: "rate_limit",
        path: pathWithQuery,
        status: res.status,
        ttfbMs,
        backoffMs: wait,
        recovered: false,
        note: `retry ${attempt + 1} of ${MAX_RETRIES} after HTTP ${res.status}`,
      });
      await res.text().catch(() => "");
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    const ms = Date.now() - started;
    recordDevex({
      at: new Date().toISOString(),
      kind: "latency",
      path: pathWithQuery,
      status: res.status,
      ttfbMs,
      backoffMs: waited || undefined,
      recovered: waited > 0 && res.ok,
    });
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new Web3ApiError(res.status, text.slice(0, 500) || res.statusText, text, res.status);
    }
    const code = Number(json.code ?? (res.ok ? 0 : res.status));
    if (!res.ok || !successCode(json.code ?? 0, json.success)) {
      const msg = String(json.msg || json.message || res.statusText || "Web3 API error");
      const errorCode = Number.isFinite(code) ? code : res.status;
      captureError(errorCode, pathWithQuery, json);
      throw new Web3ApiError(errorCode, msg, json, res.status);
    }
    return { data: json.data, raw: json, ms };
  }
  throw new Web3ApiError(429, "Rate limit persisted after backoff", null, 429);
  } finally {
    releaseSlot();
  }
}

const CAPTURED = new Set([40102, 40365, 40366, 40367, 40368, 40369, 40370, 40374, 40375, 40401, 40441, 40462]);

function captureError(code: number, pathWithQuery: string, body: unknown): void {
  if (!CAPTURED.has(code)) return;
  try {
    const root = path.resolve(readEnv().dataDir, "..");
    const dir = path.join(root, "docs", "live-errors");
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, "errors.jsonl"),
      JSON.stringify({ at: new Date().toISOString(), code, path: pathWithQuery, body }) + "\n",
    );
  } catch {
    // Capturing a doc sample must not hide the API error.
  }
}
