import assert from "node:assert/strict";
import test from "node:test";
import {
  activityForTicker,
  assetReference,
  catalogAsset,
  featuredMarkets,
  marketCatalog,
  marketLayout,
  marketViews,
  queryMarkets,
  quoteAgeLabel,
  railsFromBooks,
  type MarketCatalogAsset,
} from "./markets";
import type { OpportunityCard } from "./opportunity";
import type { RailBook, Wrapper } from "./types";
import { QUOTE_TTL_MS } from "./types";

function card(partial: Partial<OpportunityCard> & Pick<OpportunityCard, "ticker" | "rail" | "symbol" | "status">): OpportunityCard {
  return {
    name: partial.ticker,
    perShare: 0,
    reference: 0,
    referenceLabel: "prior close",
    grossPct: 0,
    slipPct: 0,
    costPct: 0,
    feePct: 0,
    netPct: 0,
    complete: false,
    liquidity: 0,
    ...partial,
  };
}

const catalog: MarketCatalogAsset[] = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    wrappers: [
      { rail: "bStock", symbol: "NVDAB", multiplier: 1 },
      { rail: "ondo", symbol: "NVDAon", multiplier: 1.1 },
      { rail: "xStock", symbol: "NVDAx", multiplier: 1 },
    ],
  },
  {
    ticker: "AAPL",
    name: "Apple",
    wrappers: [
      { rail: "bStock", symbol: "AAPLB", multiplier: 1 },
      { rail: "ondo", symbol: "AAPLon", multiplier: 1 },
      { rail: "xStock", symbol: "AAPLx", multiplier: 1 },
    ],
  },
];

const now = 10_000;

test("market catalog normalizes the seeded registry without prices", () => {
  const rows = marketCatalog();
  const nvda = rows.find((row) => row.ticker === "NVDA");
  assert.ok(nvda);
  assert.equal(nvda?.name, "NVIDIA");
  assert.deepEqual(
    nvda?.wrappers.map((wrapper) => wrapper.symbol),
    ["NVDAB", "NVDAon", "NVDAx"],
  );
  assert.equal("perShare" in (nvda || {}), false);
  assert.equal(catalogAsset("nvda")?.ticker, "NVDA");
  assert.equal(catalogAsset("NOPE"), null);
});

test("search matches ticker, company name, and wrapper symbol", () => {
  const views = marketViews(catalog, []);
  assert.deepEqual(
    queryMarkets(views, { search: "nvda" }).map((row) => row.ticker),
    ["NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { search: "apple" }).map((row) => row.ticker),
    ["AAPL"],
  );
  assert.deepEqual(
    queryMarkets(views, { search: "NVDAx" }).map((row) => row.ticker),
    ["NVDA"],
  );
});

test("status, rail, and relevance filters are explicit", () => {
  const views = marketViews(catalog, [
    card({ ticker: "NVDA", rail: "bStock", symbol: "NVDAB", status: "CLOSED", errorText: "40367 US hours" }),
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", status: "OPEN", perShare: 102, reference: 100, quoteExpiresAt: now + 20_000 }),
    card({ ticker: "AAPL", rail: "bStock", symbol: "AAPLB", status: "HALTED", errorText: "40365" }),
    card({ ticker: "AAPL", rail: "ondo", symbol: "AAPLon", status: "OFFLINE", errorText: "upstream" }),
  ]);
  assert.deepEqual(
    queryMarkets(views, { status: "OPEN" }).map((row) => row.ticker),
    ["NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { status: "HALTED" }).map((row) => row.ticker),
    ["AAPL"],
  );
  const xstock = queryMarkets(views, { rail: "xStock", search: "NVDA" })[0];
  assert.equal(xstock.best?.symbol, "NVDAx");
  assert.equal(xstock.status, "OPEN");
  const closedRail = queryMarkets(views, { rail: "bStock", search: "NVDA" })[0];
  assert.equal(closedRail.status, "CLOSED");
  assert.equal(closedRail.best?.errorText, "40367 US hours");
  assert.deepEqual(
    queryMarkets(views, { relevance: "executable", now }).map((row) => row.ticker),
    ["NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { relevance: "none" }).map((row) => row.ticker),
    ["AAPL"],
  );
});

test("sorting is deterministic", () => {
  const views = marketViews(catalog, [
    card({ ticker: "AAPL", rail: "xStock", symbol: "AAPLx", status: "OPEN", perShare: 50, reference: 40, quoteExpiresAt: now + 10_000 }),
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", status: "CLOSED" }),
  ]);
  assert.deepEqual(
    queryMarkets(views, { sort: "alpha" }).map((row) => row.ticker),
    ["AAPL", "NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { sort: "price" }).map((row) => row.ticker),
    ["AAPL", "NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { sort: "gap" }).map((row) => row.ticker),
    ["AAPL", "NVDA"],
  );
  assert.deepEqual(
    queryMarkets(views, { sort: "availability" }).map((row) => row.ticker),
    ["AAPL", "NVDA"],
  );
});

test("missing reference, fees, and prices stay null", () => {
  const [nvda] = marketViews(catalog, [
    card({
      ticker: "NVDA",
      rail: "xStock",
      symbol: "NVDAx",
      status: "OPEN",
      perShare: 101,
      reference: 0,
      networkFeeUsd: null,
      gasEstimateUsd: null,
      priceImpactPct: null,
      tradeFeeUsd: null,
      liquidity: 0,
    }),
  ]);
  assert.equal(nvda.reference, null);
  assert.equal(nvda.gapPct, null);
  assert.equal(nvda.liquidity, null);
  assert.equal(nvda.best?.networkFeeUsd, null);
  assert.equal(nvda.best?.gasEstimateUsd, null);
  assert.equal(nvda.best?.priceImpactPct, null);
  assert.equal(nvda.best?.tradeFeeUsd, null);
  assert.notEqual(nvda.best?.perShare, 0);
});

test("stale, closed, halted, and offline rails stay distinct", () => {
  assert.equal(quoteAgeLabel(now + 18_000, now).stale, false);
  assert.equal(quoteAgeLabel(now + 18_000, now).label, "12s");
  assert.equal(quoteAgeLabel(now - 1, now).label, "QUOTE STALE");
  assert.equal(quoteAgeLabel(null, now).label, "—");
  const views = marketViews(catalog, [
    card({ ticker: "NVDA", rail: "bStock", symbol: "NVDAB", status: "CLOSED" }),
    card({ ticker: "NVDA", rail: "ondo", symbol: "NVDAon", status: "HALTED" }),
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", status: "OFFLINE" }),
  ]);
  assert.equal(views[0].rails.find((rail) => rail.rail === "bStock")?.status, "CLOSED");
  assert.equal(views[0].rails.find((rail) => rail.rail === "ondo")?.status, "HALTED");
  assert.equal(views[0].rails.find((rail) => rail.rail === "xStock")?.status, "OFFLINE");
  assert.equal(views[0].status, "HALTED");
  assert.equal(featuredMarkets(views).length, 0);
});

test("featured markets use an open executable price and the absolute gap", () => {
  const views = marketViews(catalog, [
    card({ ticker: "NVDA", rail: "xStock", symbol: "NVDAx", status: "OPEN", perShare: 101, reference: 100 }),
    card({ ticker: "AAPL", rail: "xStock", symbol: "AAPLx", status: "OPEN", perShare: 110, reference: 100 }),
  ]);
  assert.deepEqual(
    featuredMarkets(views, 1).map((row) => row.ticker),
    ["AAPL"],
  );
});

test("rail books do not turn slip or a missing fee into price impact or gas", () => {
  const wrapper: Wrapper = { rail: "xStock", type: 2, symbol: "NVDAx", address: "0x1111111111111111111111111111111111111111", decimals: 18, multiplier: 2 };
  const book: RailBook = {
    wrapper,
    routes: [],
    status: "OPEN",
    badge: "SWAP",
    best: {
      wrapper,
      ok: true,
      quoteExpiresAt: now + QUOTE_TTL_MS,
      inAmount: "1",
      outAmount: "1",
      mid: 204,
      perShare: 102,
      slipBps50: 40,
      slipBps500: 80,
      slipKnown: true,
      gasUsd: 0.02,
      networkFeeUsd: 0.02,
      gasEstimateUsd: null,
      priceImpactPct: null,
      tradeFeeUsd: null,
      raw: {},
    },
  };
  const rail = railsFromBooks([book], 100).find((row) => row.rail === "xStock");
  if (!rail) throw new Error("xStock missing");
  assert.equal(rail.perShare, 102);
  assert.equal(rail.gapPct, 2);
  assert.equal(rail.priceImpactPct, null);
  assert.equal(rail.gasEstimateUsd, null);
  assert.equal(rail.networkFeeUsd, 0.02);
  assert.equal(rail.multiplier, 2);
});

test("reference view keeps missing prints empty", () => {
  const view = assetReference({ perShare: 102, priorClose: 100, priorDate: "2026-09-21", fridayClose: null, rwaReference: 0 });
  assert.equal(view.available, true);
  assert.equal(view.prints.find((print) => print.id === "prior-close")?.value, 100);
  assert.equal(view.prints.find((print) => print.id === "prior-close")?.date, "2026-09-21");
  assert.equal(view.prints.find((print) => print.id === "friday-close")?.value, null);
  assert.equal(view.prints.find((print) => print.id === "friday-close")?.date, null);
  assert.equal(view.prints.find((print) => print.id === "rwa")?.value, null);
  assert.equal(view.gaps.find((gap) => gap.label === "vs Friday close")?.pct, null);
  assert.ok((view.gaps.find((gap) => gap.label === "vs Prior cash close")?.pct || 0) > 0);
  const empty = assetReference({ perShare: null });
  assert.equal(empty.available, false);
});

test("activity is filtered to the ticker and layout switches at the desk width", () => {
  const rows = activityForTicker(
    [
      { ticker: "NVDA", id: "a" },
      { ticker: "aapl", id: "b" },
    ],
    "nvda",
  );
  assert.deepEqual(rows.map((row) => row.id), ["a"]);
  assert.equal(marketLayout(899), "stack");
  assert.equal(marketLayout(900), "table");
});
