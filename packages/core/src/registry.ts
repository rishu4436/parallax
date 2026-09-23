import type { Address, Rail, Underlying, Wrapper } from "./types";

/**
 * BSC mainnet wrappers verified 2026-09-22 against
 * GET https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=1|2|3
 * chainId=56 only. Multipliers move with dividends; refreshMultipliers() overlays the live list.
 * type 1 Ondo (`on`), type 2 xStock (`x`), type 3 bStock (`B`).
 */
interface Seed {
  ticker: string;
  name: string;
  aliases: string[];
  wrappers: Array<Omit<Wrapper, "multiplier"> & { multiplier: number }>;
}

const SEED: Seed[] = [
  seed("NVDA", "NVIDIA", ["nvidia"], [
    w("bStock", 3, "NVDAB", "0x02fca66c1d1afb4e2a7884261eb00f63598a7436", 1.000778223752807865),
    w("ondo", 1, "NVDAon", "0xa9ee28c80f960b889dfbd1902055218cba016f75", 1.0017152487959898),
    w("xStock", 2, "NVDAx", "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", 1),
  ]),
  seed("TSLA", "Tesla", ["tesla"], [
    w("bStock", 3, "TSLAB", "0x5b1910eaad6450e50f816082aa078c41f10c292f", 1),
    w("ondo", 1, "TSLAon", "0x2494b603319d4d9f9715c9f4496d9e0364b59d93", 1),
    w("xStock", 2, "TSLAx", "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0", 1),
  ]),
  seed("AAPL", "Apple", ["apple"], [
    w("bStock", 3, "AAPLB", "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a", 1.000603906075632366),
    w("ondo", 1, "AAPLon", "0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4", 1.003376073740221058),
    w("xStock", 2, "AAPLx", "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a", 1),
  ]),
  seed("AMZN", "Amazon", ["amazon"], [
    w("bStock", 3, "AMZNB", "0x1a4b499833a79a09ad7cf1d42d7dacf71e92eb00", 1),
    w("ondo", 1, "AMZNon", "0x4553cfe1c09f37f38b12dc509f676964e392f8fc", 1),
    w("xStock", 2, "AMZNx", "0x3557ba345b01efa20a1bddc61f573bfd87195081", 1),
  ]),
  seed("MSFT", "Microsoft", ["microsoft"], [
    w("bStock", 3, "MSFTB", "0x80106cb3ead06659a5ad19df39d9b4733863b9b0", 1.001313964833366845),
    w("ondo", 1, "MSFTon", "0x6bfe75d1ad432050ea973c3a3dcd88f02e2444c3", 1.005730856892783903),
    w("xStock", 2, "MSFTx", "0x5621737f42dae558b81269fcb9e9e70c19aa6b35", 1),
  ]),
  seed("META", "Meta", ["meta", "facebook"], [
    w("bStock", 3, "METAB", "0x7425889fe94f9d693e8daefe88bcced6acfef4c0", 1.00054829041074495),
    w("ondo", 1, "METAon", "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6", 1.002826918305349555),
    w("xStock", 2, "METAx", "0x96702be57cd9777f835117a809c7124fe4ec989a", 1),
  ]),
  seed("GOOGL", "Alphabet", ["alphabet", "google"], [
    w("bStock", 3, "GOOGLB", "0x3f53de71c126bdabae20f9cd64848d317f6c3238", 1.000478058978107511),
    w("ondo", 1, "GOOGLon", "0x091fc7778e6932d4009b087b191d1ee3bac5729a", 1.002460326637435211),
    w("xStock", 2, "GOOGLx", "0xe92f673ca36c5e2efd2de7628f815f84807e803f", 1),
  ]),
  seed("AMD", "AMD", ["advanced micro devices"], [
    w("bStock", 3, "AMDB", "0x75fd4cf6f8392e41e70391d60c90c0d5211603a1", 1),
    w("ondo", 1, "AMDon", "0x9f16e46c73b43bdb70861247d537bee4ea18f639", 1),
    w("xStock", 2, "AMDx", "0x3522513e5f146a2006e2901b05f16b2821485e19", 1),
  ]),
  seed("QQQ", "Invesco QQQ", ["nasdaq", "nasdaq 100", "invesco qqq"], [
    w("bStock", 3, "QQQB", "0x205812cdbed920aff76c6580abd681a46d11efc7", 1.000724838657573033),
    w("ondo", 1, "QQQon", "0x0cde6936d305d5b34667fc46425e852efd73559a", 1.004082430180208355),
    w("xStock", 2, "QQQx", "0xa753a7395cae905cd615da0b82a53e0560f250af", 1),
  ]),
  seed("SPY", "SPDR S&P 500", ["s&p", "s&p 500", "spdr", "spdr s&p 500"], [
    w("bStock", 3, "SPYB", "0x7138b48df7d98d7e3cc221bfe7192d0a178182d8", 1.001729792036835231),
    w("ondo", 1, "SPYon", "0x6a708ead771238919d85930b5a0f10454e1c331a", 1.009473072784042724),
    w("xStock", 2, "SPYx", "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", 1),
  ]),
  seed("CRCL", "Circle", ["circle"], [
    w("bStock", 3, "CRCLB", "0x80f3d493ebce97e343c53d29a137942416b4ffc0", 1),
    w("ondo", 1, "CRCLon", "0x992879cd8ce0c312d98648875b5a8d6d042cbf34", 1),
    w("xStock", 2, "CRCLx", "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb", 1),
  ]),
];

function w(
  rail: Rail,
  type: 1 | 2 | 3,
  symbol: string,
  address: string,
  multiplier: number,
): Wrapper {
  return { rail, type, symbol, address: address as Address, decimals: 18, multiplier };
}

function seed(ticker: string, name: string, aliases: string[], wrappers: Wrapper[]): Seed {
  return { ticker, name, aliases, wrappers };
}

export const UNDERLYINGS: Underlying[] = SEED.map((s) => ({
  ticker: s.ticker,
  name: s.name,
  wrappers: Object.fromEntries(s.wrappers.map((item) => [item.rail, { ...item }])) as Underlying["wrappers"],
}));

const byTicker = new Map(UNDERLYINGS.map((u) => [u.ticker, u]));
const alias = new Map<string, string>();
for (const s of SEED) {
  alias.set(norm(s.ticker), s.ticker);
  alias.set(norm(s.name), s.ticker);
  for (const a of s.aliases) alias.set(norm(a), s.ticker);
  for (const item of s.wrappers) alias.set(norm(item.symbol), s.ticker);
}

const symbolRail = new Map<string, { ticker: string; rail: Rail }>();
for (const s of SEED) {
  for (const item of s.wrappers) symbolRail.set(norm(item.symbol), { ticker: s.ticker, rail: item.rail });
}

export function norm(q: string): string {
  return q.trim().toLowerCase().replace(/[.]+/g, "").replace(/\s+/g, " ");
}

export interface ResolveHit {
  underlying: Underlying;
  railLock?: Rail;
}

export function resolveQuery(q: string): ResolveHit | null {
  const key = norm(q);
  if (!key) return null;
  const exact = symbolRail.get(key);
  if (exact) {
    const underlying = byTicker.get(exact.ticker);
    if (!underlying) return null;
    return { underlying, railLock: exact.rail };
  }
  if (key.startsWith("0x") && key.length === 42) {
    for (const u of UNDERLYINGS) {
      for (const wrapper of Object.values(u.wrappers)) {
        if (wrapper && wrapper.address.toLowerCase() === key) return { underlying: u, railLock: wrapper.rail };
      }
    }
  }
  const ticker = alias.get(key);
  if (!ticker) return null;
  const underlying = byTicker.get(ticker);
  return underlying ? { underlying } : null;
}

export function getUnderlying(ticker: string): Underlying | null {
  return byTicker.get(ticker.toUpperCase()) ?? null;
}

export function listUnderlyings(): Underlying[] {
  return UNDERLYINGS;
}

export function wrapperList(u: Underlying): Wrapper[] {
  return (["bStock", "ondo", "xStock"] as Rail[])
    .map((rail) => u.wrappers[rail])
    .filter((item): item is Wrapper => Boolean(item));
}

export interface LiveListRow {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  type: number;
  multiplier?: string;
}

/** Overlay dividend multipliers from the live public list. Addresses that disagree are returned, not overwritten. */
export function refreshMultipliers(rows: LiveListRow[]): { updated: number; mismatches: string[] } {
  const mismatches: string[] = [];
  let updated = 0;
  for (const row of rows) {
    if (String(row.chainId) !== "56") continue;
    const hit = symbolRail.get(norm(row.symbol));
    if (!hit) continue;
    const wrapper = byTicker.get(hit.ticker)?.wrappers[hit.rail];
    if (!wrapper) continue;
    if (wrapper.address.toLowerCase() !== row.contractAddress.toLowerCase()) {
      mismatches.push(`${row.symbol} registry ${wrapper.address} live ${row.contractAddress}`);
      continue;
    }
    const mult = Number(row.multiplier);
    if (Number.isFinite(mult) && mult > 0 && mult !== wrapper.multiplier) {
      wrapper.multiplier = mult;
      updated += 1;
    }
  }
  return { updated, mismatches };
}

export const QUOTE_ASSETS = {
  USDT: { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" as Address, decimals: 18 },
  USDC: { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" as Address, decimals: 18 },
  USD1: { symbol: "USD1", address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as Address, decimals: 18 },
  BNB: { symbol: "BNB", address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address, decimals: 18 },
} as const;

export const BSC_CHAIN_ID = "56";
export const RWA_LIST_URL =
  "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai";
