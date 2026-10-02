import { readEnv } from "@parallax/config";
import type { SigningCommitment } from "./commitment";
import { etParts } from "./session";
import { refreshPassport, type ExecutionPassport } from "./passport";
import { receiptStatusFromTape, updateReceipt, type ExecutionReceipt } from "./receipt";
import { getBackend } from "./store";
import type { AgentBeat, AgentFill, ArmedStrategy, FridayPrint, Job, QueuedIntent, Settings, TapeRow } from "./types";
import { RAILS } from "./types";

export { storeInfo, resetStoreBackend, FileStore, DurableStore } from "./store";
export type { StoreInfo, StoreKind } from "./store";

function readJson<T>(name: string, fallback: T): T {
  return getBackend().read(name, fallback);
}

function writeJson(name: string, value: unknown): void {
  getBackend().write(name, value);
}

export function defaultSettings(): Settings {
  const env = readEnv();
  return {
    orderCapUsdt: env.orderCapUsdt,
    dailyCapUsdt: env.dailyCapUsdt,
    allowedRails: [...RAILS],
    killSwitch: false,
    minNetEdgePct: 0.5,
    maxSlipPct: 0.5,
    minLiquidityUsd: 100_000,
    approvalRequired: true,
  };
}

export function readSettings(): Settings {
  return { ...defaultSettings(), ...readJson<Partial<Settings>>("settings.json", {}) };
}

export function writeSettings(next: Settings): Settings {
  writeJson("settings.json", next);
  return next;
}

export function readTape(): TapeRow[] {
  return readJson<TapeRow[]>("tape.json", []);
}

export function pushTape(row: TapeRow): TapeRow[] {
  return upsertTape(row);
}

export function upsertTape(row: TapeRow): TapeRow[] {
  const bound = bindTapeToReceipt(row);
  const rows = readTape().filter((item) => item.id !== bound.id);
  const next = [bound, ...rows].slice(0, 30);
  writeJson("tape.json", next);
  return next;
}

export function readJobs(): Job[] {
  return readJson<Job[]>("jobs.json", []);
}

export function writeJobs(jobs: Job[]): Job[] {
  writeJson("jobs.json", jobs);
  return jobs;
}

export function readFriday(): Record<string, FridayPrint> {
  return readJson<Record<string, FridayPrint>>("friday.json", {});
}

export function writeFriday(ticker: string, print: FridayPrint): void {
  const all = readFriday();
  all[ticker] = print;
  writeJson("friday.json", all);
}

export function spentTodayUsdt(now = new Date()): number {
  const day = etParts(now).ymd;
  return readTape()
    .filter((row) => row.status === "filled" && row.source === "agent" && etParts(new Date(row.at)).ymd === day)
    .reduce((sum, row) => sum + (Number(row.usd) || 0), 0);
}

export function writeBeat(beat: AgentBeat): void {
  writeJson("agent.json", beat);
}

export function readBeat(): AgentBeat {
  const beat = readJson<AgentBeat | null>("agent.json", null);
  if (!beat) {
    return { at: 0, status: "stopped", x402: "low", x402Detail: "worker has not started", identity: "" };
  }
  const live = Date.now() - beat.at < 30_000 && beat.status === "live";
  return { ...beat, status: live ? "live" : "stopped" };
}

export function readQueue(): QueuedIntent[] {
  return readJson<QueuedIntent[]>("queue.json", []);
}

export function pushQueue(item: QueuedIntent): QueuedIntent[] {
  const rows = [item, ...readQueue()].slice(0, 20);
  writeJson("queue.json", rows);
  return rows;
}

export function clearQueueItem(id: string): void {
  writeJson(
    "queue.json",
    readQueue().filter((row) => row.id !== id),
  );
}

export function readArmed(): ArmedStrategy[] {
  return readJson<ArmedStrategy[]>("armed.json", []);
}

export function writeArmed(rows: ArmedStrategy[]): ArmedStrategy[] {
  writeJson("armed.json", rows);
  return rows;
}

export function readWorkerEnabled(): boolean {
  return readJson<{ enabled?: boolean }>("worker.json", {}).enabled !== false;
}

export function writeWorkerEnabled(enabled: boolean): boolean {
  writeJson("worker.json", { enabled });
  return enabled;
}

export function readFills(): AgentFill[] {
  return readJson<AgentFill[]>("fills.json", []);
}

export function pushFill(row: AgentFill): AgentFill[] {
  const next = [row, ...readFills().filter((item) => item.id !== row.id)].slice(0, 40);
  writeJson("fills.json", next);
  return next;
}

export function readPassports(): ExecutionPassport[] {
  return readJson<ExecutionPassport[]>("passports.json", []);
}

export function writePassport(passport: ExecutionPassport): ExecutionPassport[] {
  const durable: ExecutionPassport = {
    hash: passport.hash,
    canonical: passport.canonical,
    issuedAt: passport.issuedAt,
    state: passport.state,
    reason: passport.reason,
    body: passport.body,
    ...(passport.gate ? { gate: passport.gate } : {}),
  };
  const rows = readPassports().filter((row) => row.hash !== durable.hash);
  const next = [durable, ...rows].slice(0, 40);
  writeJson("passports.json", next);
  return next;
}

export function findPassport(hash: string): ExecutionPassport | undefined {
  const needle = hash.toLowerCase();
  const found = readPassports().find((row) => row.hash === needle || (needle.length >= 12 && row.hash.startsWith(needle)));
  if (!found) return undefined;
  const passport = refreshPassport(found);
  const receipt = findReceiptByPassport(passport.hash);
  const commitment = findCommitmentByPassport(passport.hash) || (receipt?.signingCommitmentHash ? findCommitment(receipt.signingCommitmentHash) : undefined);
  return { ...passport, commitment, receipt };
}

export function readCommitments(): SigningCommitment[] {
  return readJson<SigningCommitment[]>("commitments.json", []);
}

export function writeCommitment(commitment: SigningCommitment): SigningCommitment[] {
  const rows = readCommitments().filter((row) => row.hash !== commitment.hash);
  const next = [commitment, ...rows].slice(0, 80);
  writeJson("commitments.json", next);
  return next;
}

export function findCommitment(hash: string): SigningCommitment | undefined {
  const needle = hash.toLowerCase();
  return readCommitments().find((row) => row.hash === needle || (needle.length >= 12 && row.hash.startsWith(needle)));
}

export function findCommitmentByPassport(passportHash: string): SigningCommitment | undefined {
  return readCommitments().find((row) => row.passportHash === passportHash);
}

export function readReceipts(): ExecutionReceipt[] {
  return readJson<ExecutionReceipt[]>("receipts.json", []);
}

export function writeReceipt(receipt: ExecutionReceipt): ExecutionReceipt[] {
  const rows = readReceipts().filter((row) => row.id !== receipt.id && row.hash !== receipt.hash);
  const next = [receipt, ...rows].slice(0, 80);
  writeJson("receipts.json", next);
  return next;
}

export function findReceipt(idOrHash: string): ExecutionReceipt | undefined {
  const needle = idOrHash.toLowerCase();
  return readReceipts().find(
    (row) => row.id === idOrHash || row.hash === needle || (needle.length >= 12 && (row.hash.startsWith(needle) || row.passportHash.startsWith(needle))),
  );
}

export function findReceiptByPassport(passportHash: string): ExecutionReceipt | undefined {
  return readReceipts().find((row) => row.passportHash === passportHash);
}

function bindTapeToReceipt(row: TapeRow): TapeRow {
  if (!row.passportHash) return row;
  const existing = row.receiptId ? findReceipt(row.receiptId) : findReceiptByPassport(row.passportHash);
  if (!existing) return row;
  const status = receiptStatusFromTape(row.status);
  let receipt = existing;
  if (
    status &&
    (status !== existing.status ||
      (row.txHash && row.txHash !== existing.txHash) ||
      (row.orderId && row.orderId !== existing.orderId))
  ) {
    receipt = updateReceipt(existing, {
      status,
      txHash: row.txHash ?? existing.txHash,
      orderId: row.orderId ?? existing.orderId,
      filledAt: status === "filled" ? existing.filledAt ?? Date.now() : existing.filledAt,
    });
    writeReceipt(receipt);
  }
  return {
    ...row,
    receiptId: receipt.id,
    signingCommitmentHash: receipt.signingCommitmentHash ?? row.signingCommitmentHash,
  };
}

export function rememberExecution(input: {
  passport: ExecutionPassport;
  commitment?: SigningCommitment | null;
  receipt?: ExecutionReceipt | null;
  tape?: TapeRow;
}): void {
  writePassport(input.passport);
  if (input.commitment) writeCommitment(input.commitment);
  if (input.receipt) writeReceipt(input.receipt);
  if (input.tape) upsertTape(input.tape);
}

export const PassportStore = {
  list: readPassports,
  write: writePassport,
  find: findPassport,
};

export const ExecutionStore = {
  writeCommitment,
  findCommitment,
  findCommitmentByPassport,
  listCommitments: readCommitments,
  writeReceipt,
  findReceipt,
  findByPassport: findReceiptByPassport,
  listReceipts: readReceipts,
};

export const ActivityStore = {
  readTape,
  upsertTape,
  readFills,
  pushFill,
};

export const SettingsStore = {
  read: readSettings,
  write: writeSettings,
};
