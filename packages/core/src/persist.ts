import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";
import { etParts } from "./session";
import type { AgentBeat, FridayPrint, Job, QueuedIntent, Settings, TapeRow } from "./types";
import { RAILS } from "./types";

function dir(): string {
  const d = readEnv().dataDir;
  mkdirSync(d, { recursive: true });
  return d;
}

function readJson<T>(name: string, fallback: T): T {
  const file = path.join(dir(), name);
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(name: string, value: unknown): void {
  const file = path.join(dir(), name);
  writeFileSync(file, JSON.stringify(value, null, 2));
}

export function defaultSettings(): Settings {
  const env = readEnv();
  return {
    orderCapUsdt: env.orderCapUsdt,
    dailyCapUsdt: env.dailyCapUsdt,
    allowedRails: [...RAILS],
    killSwitch: false,
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
  const rows = readTape().filter((item) => item.id !== row.id);
  const next = [row, ...rows].slice(0, 30);
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
