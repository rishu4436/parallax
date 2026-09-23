import assert from "node:assert/strict";
import test from "node:test";
import { parseSettings } from "./settings";

test("parseSettings keeps a raised order cap", () => {
  const next = parseSettings({
    orderCapUsdt: 50,
    dailyCapUsdt: 200,
    allowedRails: ["ondo", "xStock"],
    killSwitch: false,
  });
  assert.equal(next.orderCapUsdt, 50);
  assert.equal(next.dailyCapUsdt, 200);
  assert.deepEqual(next.allowedRails, ["ondo", "xStock"]);
});

test("parseSettings rejects a blank or zero cap", () => {
  assert.throws(() => parseSettings({ orderCapUsdt: 0, dailyCapUsdt: 100, allowedRails: ["ondo"], killSwitch: false }), /greater than zero/);
  assert.throws(
    () => parseSettings({ orderCapUsdt: Number.NaN, dailyCapUsdt: 100, allowedRails: ["ondo"], killSwitch: false }),
    /greater than zero/,
  );
});
