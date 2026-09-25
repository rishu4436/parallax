import assert from "node:assert/strict";
import test from "node:test";
import { parseRwaPriceRows, parseRwaUnderlyingMarket } from "./rwa";

test("RWA price rows expose on-chain token vs underlying reference", () => {
  const rows = parseRwaPriceRows([
    {
      binanceChainId: "56",
      tokenContractAddress: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
      platformId: "bstock",
      tokenPrice: "224.50",
      referencePrice: "224.27",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tokenPrice, 224.5);
  assert.equal(rows[0].referencePrice, 224.27);
  assert.equal(rows[0].platformId, "bstock");
});

test("RWA underlying-market previousClose hydrates the cash prior print", () => {
  const market = parseRwaUnderlyingMarket({
    marketData: {
      referencePrice: "224.10",
      previousClose: "225.51",
      open: "222.12",
      lastPrice: "224.33",
      amplitude: "3.05",
      peRatioTTM: "45.2",
    },
  });
  assert.equal(market.previousClose, 225.51);
  assert.equal(market.open, 222.12);
  assert.equal(market.last, 224.33);
  assert.equal(market.referencePrice, 224.1);
});

test("RWA underlying-market accepts prevClose aliases", () => {
  const market = parseRwaUnderlyingMarket({
    prevClose: "222.27",
    referencePrice: "223.01",
  });
  assert.equal(market.previousClose, 222.27);
  assert.equal(market.referencePrice, 223.01);
});
