import { spawn } from "node:child_process";

export class BawError extends Error {
  code?: number;
  nameCode?: string;
  constructor(message: string, code?: number, nameCode?: string) {
    super(message);
    this.name = "BawError";
    this.code = code;
    this.nameCode = nameCode;
  }
}

export function runBaw(args: string[], timeoutMs = 20_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn("baw", args, {
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
        const json = JSON.parse(text) as { success?: boolean; error?: { message?: string; code?: number; name?: string } };
        if (json.success === false) {
          reject(new BawError(json.error?.message || "Agentic Wallet rejected the request.", json.error?.code, json.error?.name));
          return;
        }
        resolve(json);
      } catch {
        reject(new BawError(text.slice(0, 400)));
      }
    });
  });
}
