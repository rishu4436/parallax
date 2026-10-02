import assert from "node:assert/strict";
import test from "node:test";
import { agenticAvailability } from "./opportunityView";
import {
  buildPortfolio,
  executionsForTickers,
  marketHref,
  opportunityHref,
  portfolioLayout,
  walletPhase,
  type PortfolioBalanceLine,
} from "./portfolioView";
import type { TapeRow } from "./types";

const nvdaX: PortfolioBalanceLine = {
  symbol: "NVDAx",
  address: "0x1111111111111111111111111111111111111111",
  rail: "xStock",
  ticker: "NVDA",
  amount: 2,
  multiplier: 1,
};
const nvdaB: PortfolioBalanceLine = {
  symbol: "NVDAB",
  address: "0x2222222222222222222222222222222222222222",
  rail: "bStock",
  ticker: "NVDA",
  amount: 1,
  multiplier: 1,
};

test("disconnected wallet has no holdings", () => {
  const view = buildPortfolio({ connected: false, lines: [nvdaX] });
  assert.equal(walletPhase(false), "DISCONNECTED");
  assert.equal(view.equity.length, 0);
  assert.equal(view.valuation.valuedUsd, null);
});

test("empty connected wallet is not filled with examples", () => {
  const view = buildPortfolio({ connected: true, lines: [{ ...nvdaX, amount: 0 }], names: { NVDA: "NVIDIA" } });
  assert.equal(walletPhase(true), "CONNECTED");
  assert.equal(view.equity.length, 0);
});

test("known wrappers group by underlying and unknown tokens stay unknown", () => {
  const view = buildPortfolio({
    connected: true,
    names: { NVDA: "NVIDIA" },
    lines: [nvdaX, nvdaB, { symbol: "USDT", address: "0x55", amount: 20 }, { symbol: "DOGE", address: "0x3333333333333333333333333333333333333333", amount: 5 }],
    quotes: [{ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", perShare: 102, reference: 100, quoteExpiresAt: 2_000 }],
  });
  assert.equal(view.equity.length, 2);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].name, "NVIDIA");
  assert.equal(view.groups[0].combinedShares, 3);
  assert.equal(view.groups[0].combinedValueUsd, null);
  assert.equal(view.equity.find((row) => row.symbol === "NVDAx")?.status, "TRACKED");
  assert.equal(view.equity.find((row) => row.symbol === "NVDAx")?.valueUsd, 204);
  assert.equal(view.equity.find((row) => row.symbol === "NVDAB")?.status, "UNVALUED");
  assert.equal(view.equity.find((row) => row.symbol === "NVDAB")?.valueUsd, null);
  assert.equal(view.stables[0].symbol, "USDT");
  assert.equal(view.stables[0].valueUsd, null);
  assert.equal(view.other[0].symbol, "DOGE");
  assert.equal(view.other[0].status, "UNKNOWN");
  assert.equal(view.other[0].ticker, null);
  assert.equal(view.valuation.partial, true);
  assert.equal(view.valuation.valuedUsd, 204);
  assert.equal(view.watchlist.length, 1);
  assert.equal(marketHref("NVDA"), "/markets/NVDA");
  assert.equal(opportunityHref("NVDA"), "/opportunities?ticker=NVDA");
});

test("missing prices are not valued at zero", () => {
  const view = buildPortfolio({
    connected: true,
    names: { NVDA: "NVIDIA" },
    lines: [{ ...nvdaX, multiplier: null }],
    quotes: [{ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", perShare: 0, reference: 0 }],
  });
  assert.equal(view.equity[0].valueUsd, null);
  assert.equal(view.equity[0].status, "UNVALUED");
  assert.equal(view.valuation.valuedUsd, null);
  assert.equal(view.groups[0].combinedValueUsd, null);
});

test("execution history filters to held tickers and passport hashes stay attached", () => {
  const tape: TapeRow[] = [
    { id: "a", at: 2, side: "buy", ticker: "NVDA", symbol: "NVDAx", rail: "xStock", usd: "10", status: "filled", passportHash: "abc", txHash: "0x1" },
    { id: "b", at: 1, side: "buy", ticker: "AAPL", symbol: "AAPLx", rail: "xStock", usd: "10", status: "filled" },
  ];
  const rows = executionsForTickers(tape, ["NVDA"]);
  assert.deepEqual(rows.map((row) => row.id), ["a"]);
  assert.equal(rows[0].passportHash, "abc");
  assert.equal(executionsForTickers(tape, []).length, 0);
});

test("agentic wallet state and layout stay explicit", () => {
  assert.equal(agenticAvailability("CONNECTED"), "CONNECTED");
  assert.equal(agenticAvailability("UNCONNECTED"), "DISCONNECTED");
  assert.equal(portfolioLayout(899), "stack");
  assert.equal(portfolioLayout(900), "table");
});
