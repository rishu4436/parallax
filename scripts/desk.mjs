import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const env = { ...process.env, PORT: port };
const children = [];

function start(args) {
  const child = spawn("pnpm", args, { stdio: "inherit", env, shell: process.platform === "win32" });
  child.on("exit", (code) => {
    if (code && code !== 0) stop(code);
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

start(["--filter", "@parallax/web", "start"]);
start(["agent"]);
console.log(`PARALLAX desk on :${port}, worker in the same process group.`);
