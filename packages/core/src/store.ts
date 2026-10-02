import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";

export type StoreKind = "file" | "memory";

export interface StoreBackend {
  kind: StoreKind;
  durable: boolean;
  read<T>(name: string, fallback: T): T;
  write(name: string, value: unknown): void;
}

export interface StoreInfo {
  kind: StoreKind;
  durable: boolean;
}

const memory = new Map<string, string>();
let backend: StoreBackend | null = null;

function fileDir(): string {
  const d = readEnv().dataDir;
  mkdirSync(d, { recursive: true });
  return d;
}

function ephemeral(): boolean {
  if (process.env.PARALLAX_STORE === "file") return false;
  if (process.env.PARALLAX_STORE === "memory") return true;
  return Boolean(process.env.VERCEL);
}

/** Local desk/worker: JSON files under PARALLAX_DATA_DIR. Durable on that machine. */
export const FileStore: StoreBackend = {
  kind: "file",
  durable: true,
  read<T>(name: string, fallback: T): T {
    const file = path.join(fileDir(), name);
    if (!existsSync(file)) return fallback;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      return fallback;
    }
  },
  write(name: string, value: unknown): void {
    writeFileSync(path.join(fileDir(), name), JSON.stringify(value, null, 2));
  },
};

/**
 * Process memory. Used on Vercel so the filesystem is not treated as durable.
 * durable is false. A future KV or Postgres backend can take the name DurableStore.
 */
export const MemoryStore: StoreBackend = {
  kind: "memory",
  durable: false,
  read<T>(name: string, fallback: T): T {
    const raw = memory.get(name);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  write(name: string, value: unknown): void {
    memory.set(name, JSON.stringify(value));
  },
};

export function getBackend(): StoreBackend {
  if (!backend) backend = ephemeral() ? MemoryStore : FileStore;
  return backend;
}

export function storeInfo(): StoreInfo {
  const row = getBackend();
  return { kind: row.kind, durable: row.durable };
}

export function resetStoreBackend(): void {
  backend = null;
  memory.clear();
}
