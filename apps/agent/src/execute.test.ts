import assert from "node:assert/strict";
import test from "node:test";
import { marketSwapArgs, pendingOrderId, tokenQtyFromNotional } from "./execute";

test("a buy spends USDT for the wrapper the job chose", () => {
  const built = marketSwapArgs({
    side: "buy",
    usdt: "10",
    token: "0x1111111111111111111111111111111111111111",
  });
  assert.ok(!("error" in built));
  if ("error" in built) return;
  assert.deepEqual(built.args.slice(0, 8), [
    "market-order",
    "swap",
    "--fromTokenQty",
    "10",
    "--fromToken",
    "0x55d398326f99059fF775485246999027B3197955",
    "--toToken",
    "0x1111111111111111111111111111111111111111",
  ]);
});

test("a sell uses the token amount, not the USDT notional", () => {
  assert.equal(tokenQtyFromNotional("10", 200), "0.050000");
  const missing = marketSwapArgs({ side: "sell", usdt: "10", token: "0x1111111111111111111111111111111111111111" });
  assert.equal("error" in missing, true);
  assert.equal(pendingOrderId("submitted · baw:123456 · still processing"), "123456");
});
