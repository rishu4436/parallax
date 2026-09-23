import {
  QUOTE_ASSETS,
  bookFromRoutes,
  fetchCashPrints,
  freshExpiry,
  fromBaseUnits,
  getUnderlying,
  pickBest,
  refreshMultipliers,
  toBaseUnits,
  wrapperList,
  type Address,
  type Intent,
  type Rail,
  type RailBook,
  type Side,
  type Underlying,
  type VenueQuote,
  type Wrapper,
} from "@parallax/core";
import { isWeb3Error } from "./client";
import { fetchAllRwaLists, fetchDynamic } from "./rwa";
import { getQuote } from "./trading";

export interface QuoteBook {
  underlying: Underlying;
  books: RailBook[];
  best: RailBook | null;
  fridayClose: number | null;
  fridayOpen: number | null;
  fridayDate: string | null;
  fridaySource: string | null;
  priorClose: number | null;
  priorOpen: number | null;
  priorDate: string | null;
  sessionOpen: number | null;
  sessionOpenDate: string | null;
  ms: number;
}

let listRefresh: Promise<void> | null = null;

async function ensureMultipliers(): Promise<void> {
  if (!listRefresh) {
    listRefresh = fetchAllRwaLists()
      .then((rows) => {
        refreshMultipliers(rows);
      })
      .catch(() => {
        listRefresh = null;
      });
  }
  await listRefresh;
}

interface RawRoute {
  quoteId?: string;
  vendorName?: string;
  fromTokenAmount?: string;
  toTokenAmount?: string;
  tradeFee?: string | null;
  executionMode?: "SWAP" | "RFQ";
  approveTarget?: string | null;
  priceImpactPercent?: string | null;
}

function asRoutes(data: unknown): RawRoute[] {
  if (Array.isArray(data)) return data as RawRoute[];
  if (data && typeof data === "object") return [data as RawRoute];
  return [];
}

function mapRoute(
  wrapper: Wrapper,
  route: RawRoute,
  side: Side,
  stableDecimals: number,
  receivedAt: number,
): VenueQuote {
  const inAmount = String(route.fromTokenAmount ?? "0");
  const outAmount = String(route.toTokenAmount ?? "0");
  const inDec = side === "buy" ? stableDecimals : wrapper.decimals;
  const outDec = side === "buy" ? wrapper.decimals : stableDecimals;
  const inHuman = fromBaseUnits(inAmount, inDec);
  const outHuman = fromBaseUnits(outAmount, outDec);
  const mid = side === "buy" ? (outHuman > 0 ? inHuman / outHuman : 0) : inHuman > 0 ? outHuman / inHuman : 0;
  const perShare = wrapper.multiplier > 0 ? mid / wrapper.multiplier : mid;
  const gasUsd = Number(route.tradeFee ?? 0);
  return {
    wrapper,
    ok: Boolean(route.toTokenAmount && route.toTokenAmount !== "0"),
    executionMode: route.executionMode,
    vendorName: route.vendorName,
    quoteId: route.quoteId,
    quoteExpiresAt: freshExpiry(receivedAt),
    inAmount,
    outAmount,
    mid,
    perShare,
    slipBps50: 0,
    slipBps500: 0,
    slipKnown: false,
    gasUsd: Number.isFinite(gasUsd) ? gasUsd : 0,
    approveTarget: route.approveTarget || undefined,
    raw: route,
  };
}

function failed(wrapper: Wrapper, err: unknown): VenueQuote {
  const code = isWeb3Error(err) ? err.code : undefined;
  const text = err instanceof Error ? err.message : String(err);
  return {
    wrapper,
    ok: false,
    errorCode: code,
    errorText: text,
    quoteExpiresAt: freshExpiry(),
    inAmount: "0",
    outAmount: "0",
    mid: 0,
    perShare: 0,
    slipBps50: 0,
    slipBps500: 0,
    slipKnown: false,
    gasUsd: 0,
    raw: isWeb3Error(err) ? err.body : { message: text },
  };
}

async function quoteOnce(
  wrapper: Wrapper,
  side: Side,
  amount: string,
  wallet: Address,
  stable: keyof typeof QUOTE_ASSETS,
): Promise<{ quotes: VenueQuote[]; ms: number }> {
  const asset = QUOTE_ASSETS[stable];
  const from = side === "buy" ? asset.address : wrapper.address;
  const to = side === "buy" ? wrapper.address : asset.address;
  const started = Date.now();
  try {
    const res = await getQuote({
      fromTokenAddress: from,
      toTokenAddress: to,
      amount,
      userWalletAddress: wallet,
    });
    const routes = asRoutes(res.data).map((route) => mapRoute(wrapper, route, side, asset.decimals, started));
    if (!routes.length) return { quotes: [failed(wrapper, new Error("Quote returned no routes"))], ms: res.ms };
    return { quotes: routes, ms: res.ms };
  } catch (err) {
    return { quotes: [failed(wrapper, err)], ms: Date.now() - started };
  }
}

function applySlip(primary: VenueQuote[], ref: VenueQuote | undefined, fifty: VenueQuote | undefined, five: VenueQuote | undefined) {
  if (!ref?.ok) return;
  for (const route of primary) {
    if (!route.ok || !(route.perShare > 0) || !(ref.perShare > 0)) continue;
    const bps = (other?: VenueQuote) => {
      if (!other?.ok || !(other.perShare > 0)) return null;
      return Math.round(((other.perShare - ref.perShare) / ref.perShare) * 10_000);
    };
    const s50 = bps(fifty);
    const s500 = bps(five);
    if (s50 == null && s500 == null) continue;
    route.slipBps50 = s50 ?? 0;
    route.slipBps500 = s500 ?? 0;
    route.slipKnown = true;
  }
}

async function referencePrice(wrapper: Wrapper): Promise<number | null> {
  const snap = await fetchDynamic(wrapper.address).catch(() => null);
  if (snap?.multiplier && snap.multiplier > 0) wrapper.multiplier = snap.multiplier;
  return snap?.price ?? null;
}

export async function quoteIntent(intent: Intent, opts?: { slip?: boolean; allowed?: Rail[] }): Promise<QuoteBook> {
  const started = Date.now();
  await ensureMultipliers().catch(() => undefined);
  const underlying = getUnderlying(intent.ticker);
  if (!underlying) throw new Error(`No BSC wrapper for ${intent.ticker}.`);
  const stable = intent.stable ?? "USDT";
  const stableDecimals = QUOTE_ASSETS[stable].decimals;
  const usdtBase = toBaseUnits(intent.usdt, stableDecimals);
  const wrappers = wrapperList(underlying).filter((w) => !opts?.allowed || opts.allowed.includes(w.rail));
  const locked = intent.railLock ? wrappers.filter((w) => w.rail === intent.railLock) : wrappers;

  const sized = await Promise.all(
    locked.map(async (wrapper) => {
      if (intent.side === "buy") return { wrapper, amount: usdtBase };
      const probe = await quoteOnce(wrapper, "buy", usdtBase, intent.wallet, stable);
      const mid = probe.quotes.find((q) => q.ok)?.mid;
      const px = mid && mid > 0 ? mid : await referencePrice(wrapper);
      if (!px || !(px > 0)) return { wrapper, amount: "", probeError: probe.quotes[0] };
      const tokens = Number(intent.usdt) / px;
      return { wrapper, amount: toBaseUnits(tokens.toFixed(8), wrapper.decimals) };
    }),
  );

  const primary = await Promise.all(
    sized.map(async (row) => {
      if (!row.amount) return { wrapper: row.wrapper, quotes: [row.probeError ?? failed(row.wrapper, new Error("No price to size the sell."))], ms: 0 };
      return { wrapper: row.wrapper, ...(await quoteOnce(row.wrapper, intent.side, row.amount, intent.wallet, stable)) };
    }),
  );

  if (opts?.slip !== false && intent.side === "buy") {
    const notionals = ["50", "500"].map((n) => toBaseUnits(n, stableDecimals));
    await Promise.all(
      primary.map(async (row, index) => {
        const refQuote = row.quotes.find((q) => q.ok);
        const [q50, q500] = await Promise.all([
          quoteOnce(row.wrapper, "buy", notionals[0], intent.wallet, stable),
          quoteOnce(row.wrapper, "buy", notionals[1], intent.wallet, stable),
        ]);
        applySlip(row.quotes, refQuote, q50.quotes.find((q) => q.ok), q500.quotes.find((q) => q.ok));
        primary[index] = row;
      }),
    );
  }

  const books = primary.map((row) => bookFromRoutes(row.quotes));
  const best = pickBest(books, intent.railLock, opts?.allowed);
  let fridayClose: number | null = null;
  let fridayOpen: number | null = null;
  let fridayDate: string | null = null;
  let fridaySource: string | null = null;
  let priorClose: number | null = null;
  let priorOpen: number | null = null;
  let priorDate: string | null = null;
  let sessionOpen: number | null = null;
  let sessionOpenDate: string | null = null;
  try {
    const prints = await fetchCashPrints(underlying.ticker);
    fridayClose = prints.friday?.close ?? null;
    fridayOpen = prints.friday?.open ?? null;
    fridayDate = prints.friday?.sessionDate ?? null;
    fridaySource = prints.friday ? prints.source : null;
    priorClose = prints.prior?.close ?? null;
    priorOpen = prints.prior?.open ?? null;
    priorDate = prints.prior?.sessionDate ?? null;
    sessionOpen = prints.today?.open ?? null;
    sessionOpenDate = prints.today?.sessionDate ?? null;
  } catch {
    fridayClose = null;
  }
  return {
    underlying,
    books,
    best,
    fridayClose,
    fridayOpen,
    fridayDate,
    fridaySource,
    priorClose,
    priorOpen,
    priorDate,
    sessionOpen,
    sessionOpenDate,
    ms: Date.now() - started,
  };
}
