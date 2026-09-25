import assert from "node:assert/strict";
import test from "node:test";
import { retryDelay, shouldRetryHttp } from "./client";

test("retry delay starts at 350ms and doubles with jitter", () => {
  for (const attempt of [0, 1, 2]) {
    const base = 350 * 2 ** attempt;
    for (let i = 0; i < 20; i++) {
      const delay = retryDelay(attempt);
      assert.ok(delay >= base, `attempt ${attempt} delay ${delay} < ${base}`);
      assert.ok(delay <= base + Math.floor(base * 0.3), `attempt ${attempt} delay ${delay} too large`);
    }
  }
});

test("429 and 50x retry, other HTTP statuses do not", () => {
  assert.equal(shouldRetryHttp(429), true);
  assert.equal(shouldRetryHttp(500), true);
  assert.equal(shouldRetryHttp(502), true);
  assert.equal(shouldRetryHttp(503), true);
  assert.equal(shouldRetryHttp(504), true);
  assert.equal(shouldRetryHttp(599), true);
  assert.equal(shouldRetryHttp(400), false);
  assert.equal(shouldRetryHttp(401), false);
  assert.equal(shouldRetryHttp(404), false);
  assert.equal(shouldRetryHttp(200), false);
});
