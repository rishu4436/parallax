import { spawn } from "node:child_process";

export class BawError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BawError";
  }
}

export function runBaw(args: string[], timeoutMs = 25_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("baw", [...args, "--json"], {
      shell: process.platform === "win32",
      windowsHide: true,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new BawError("Agentic Wallet timed out."));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new BawError(error.message));
    });
    child.on("close", () => {
      clearTimeout(timer);
      const text = out.trim() || err.trim();
      if (!text) {
        reject(new BawError("Agentic Wallet returned an empty response."));
        return;
      }
      try {
        const json = JSON.parse(text) as { success?: boolean; error?: { message?: string } };
        if (json.success === false) {
          reject(new BawError(json.error?.message || "Agentic Wallet rejected the request."));
          return;
        }
        resolve(json);
      } catch {
        reject(new BawError(text.slice(0, 400)));
      }
    });
  });
}

export function bawData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const data = (value as { data?: unknown }).data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}
