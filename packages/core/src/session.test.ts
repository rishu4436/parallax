import assert from "node:assert/strict";
import test from "node:test";
import { cashSession, classifyEt, etInstant, etParts } from "./session";

test("Tuesday 22 Sep 2026 15:00 ET is regular and open", () => {
  const at = etInstant(2026, 9, 22, 15, 0);
  const view = cashSession(at);
  assert.equal(view.kind, "regular");
  assert.equal(view.atmosphere, "open");
  assert.equal(view.chip, "US cash open");
});

test("Tuesday 22 Sep 2026 18:12 ET is closed with a countdown chip", () => {
  const at = etInstant(2026, 9, 22, 18, 12);
  const view = cashSession(at);
  assert.equal(view.kind, "post");
  assert.equal(view.atmosphere, "closed");
  assert.match(view.chip, /^US cash closed · \d+h \d+m to 09:30 ET$/);
});

test("Saturday is weekend closed", () => {
  const at = etInstant(2026, 9, 26, 12, 0);
  const view = cashSession(at);
  assert.equal(view.kind, "weekend");
  assert.equal(view.atmosphere, "closed");
});

test("Labor Day 2026 is a holiday", () => {
  const at = etInstant(2026, 9, 7, 12, 0);
  assert.equal(classifyEt(etParts(at)), "holiday");
  assert.equal(cashSession(at).atmosphere, "closed");
});

test("forcing the session closed flips atmosphere even inside regular hours", () => {
  const at = etInstant(2026, 9, 22, 15, 0);
  const open = cashSession(at);
  const closed = cashSession(at, "closed");
  assert.equal(open.atmosphere, "open");
  assert.equal(closed.atmosphere, "closed");
  assert.equal(closed.forced, true);
});

test("live New York clock uses the same classifier", () => {
  const now = new Date();
  const view = cashSession(now);
  const outside = classifyEt(etParts(now)) !== "regular";
  assert.equal(view.atmosphere, outside ? "closed" : "open");
});
