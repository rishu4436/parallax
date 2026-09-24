import assert from "node:assert/strict";
import test from "node:test";
import { BasisTrade } from "./loops/BasisTrade";
import { Correlation } from "./loops/Correlation";
import { CrossArb } from "./loops/CrossArb";

const pair = ["NVDA"];

test("basis fires only while cash is closed and the gap clears the target", () => {
  const strategy = new BasisTrade({ id: "b", assetPairs: pair, targetSpread: 1 });
  assert.equal(strategy.evaluateCondition({ currentPrice: 90, volume: 1 }, { referencePrice: 100, isMarketOpen: true }), false);
  assert.equal(strategy.evaluateCondition({ currentPrice: 99.5, volume: 1 }, { referencePrice: 100, isMarketOpen: false }), false);
  assert.equal(strategy.evaluateCondition({ currentPrice: 90, volume: 1 }, { referencePrice: 100, isMarketOpen: false }), true);
  assert.equal(strategy.side, "buy");
  assert.equal(strategy.generateSwapPayload().data, "0x");
});

test("cross arb buys the cheaper of bStock and Ondo", () => {
  const strategy = new CrossArb({ id: "c", assetPairs: pair, targetSpread: 0.4 });
  assert.equal(strategy.evaluateCondition({ currentPrice: 100, volume: 1 }, { referencePrice: 100.2, isMarketOpen: true }), false);
  assert.equal(strategy.evaluateCondition({ currentPrice: 101, volume: 2 }, { referencePrice: 100, isMarketOpen: true }), true);
  assert.equal(strategy.rail, "ondo");
  assert.equal(strategy.side, "buy");
});

test("correlation fires when equity and BNB changes diverge", () => {
  const strategy = new Correlation({
    id: "k",
    assetPairs: pair,
    targetSpread: 1,
    volatilityDriftThreshold: 1.5,
    targetPortfolioRatio: 0.6,
  });
  assert.equal(strategy.evaluateCondition({ currentPrice: -0.2, volume: 1 }, { referencePrice: -0.4, isMarketOpen: true }), false);
  assert.equal(strategy.evaluateCondition({ currentPrice: -3, volume: 1 }, { referencePrice: 1, isMarketOpen: true }), true);
  assert.equal(strategy.side, "buy");
  assert.equal(strategy.ratio, 0.6);
});
