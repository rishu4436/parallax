import { createHmac, randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";

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

export async function web3Fetch(
  method: "GET" | "POST",
  path: string,
  opts?: { query?: Record<string, string | number | boolean | undefined | null>; body?: unknown },
): Promise<{ data: unknown; raw: unknown; ms: number }> {
  const env = readEnv();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(opts?.query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  const pathWithQuery = qs ? `${path}?${qs}` : path;
  const bodyText = opts?.body === undefined ? "" : JSON.stringify(opts.body);
  const timestamp = new Date().toISOString();
  const prehash = `${timestamp}${method}/build${pathWithQuery}${bodyText}`;
  const signature = createHmac("sha256", env.web3ApiSecret).update(prehash).digest("base64");
  const started = Date.now();
  const res = await fetch(`${env.web3ApiBase}${pathWithQuery}`, {
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
  const text = await res.text();
  const ms = Date.now() - started;
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
