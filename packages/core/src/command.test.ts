import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand } from "./command";

test("parseCommand jumps to shell routes", () => {
  assert.deepEqual(parseCommand("home"), { type: "jump", target: "home", label: "home" });
  assert.deepEqual(parseCommand("overview"), { type: "jump", target: "home", label: "home" });
  assert.deepEqual(parseCommand("desk"), { type: "jump", target: "trade", label: "trade" });
  assert.deepEqual(parseCommand("trade"), { type: "jump", target: "trade", label: "trade" });
  assert.deepEqual(parseCommand("jobs"), { type: "jump", target: "jobs", label: "jobs" });
  assert.deepEqual(parseCommand("wallet"), { type: "jump", target: "wallet", label: "wallet" });
  assert.deepEqual(parseCommand("settings"), { type: "jump", target: "settings", label: "settings" });
});

test("parseCommand still resolves a live ticker", () => {
  const hit = parseCommand("NVDA");
  assert.equal(hit?.type, "ticker");
  if (hit?.type === "ticker") assert.equal(hit.hit.underlying.ticker, "NVDA");
});
