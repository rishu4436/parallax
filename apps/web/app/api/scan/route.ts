import { readEnv } from "@parallax/config";
import { edgeBreakdown, listUnderlyings, rankOpportunities, type OpportunityCard } from "@parallax/core";
import { fetchMarketPrint, quoteIntent } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ScanCache {
  at: number;
  usdt: string;
  cards: OpportunityCard[];
}

let cache: ScanCache | null = null;
const TTL_MS = 30_000;

export async function GET(request: Request) {
  return scan(new URL(request.url).searchParams.get("usdt") || "10");
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ usdt?: string }>(request);
    return scan(body.usdt || "10");
  } catch (err) {
    return fail(err);
  }
}

async function scan(usdt: string) {
  const now = Date.now();
  if (cache && cache.usdt === usdt && now - cache.at < TTL_MS) {
    return Response.json({ ok: true, cached: true, at: cache.at, cards: cache.cards });
  }
  const env = readEnv();
  const notional = Number(usdt);
  const names = listUnderlyings();
  const cards: OpportunityCard[] = [];
  await Promise.all(
    names.map(async (underlying) => {
      try {
        const book = await quoteIntent(
          { ticker: underlying.ticker, usdt, side: "buy", wallet: env.quoteWallet },
          { slip: false },
        );
        const reference = book.priorClose ?? book.fridayClose ?? book.referencePrice;
        const referenceLabel = book.priorClose
          ? `prior close${book.priorDate ? ` ${book.priorDate}` : ""}`
          : book.fridayClose
            ? `Friday cash close${book.fridayDate ? ` ${book.fridayDate}` : ""}`
            : "RWA reference";
        for (const row of book.books) {
          const quote = row.best;
          let liquidity: number | null = null;
          try {
            const print = await fetchMarketPrint(row.wrapper.address);
            liquidity = print.volumeKnown ? print.volume : null;
          } catch {
            liquidity = null;
          }
          const quoted = quote?.ok ? quote : null;
          const facts = {
            ...(quoted ? { quoteExpiresAt: quoted.quoteExpiresAt } : {}),
            networkFeeUsd: quoted?.networkFeeUsd ?? null,
            gasEstimateUsd: quoted?.gasEstimateUsd ?? null,
            estimatedGasUnits: quoted?.estimatedGasUnits ?? null,
            priceImpactPct: quoted?.priceImpactPct ?? null,
            tradeFeeUsd: quoted?.tradeFeeUsd ?? null,
            multiplier: row.wrapper.multiplier,
          };
          if (!quote?.ok || !reference || !(notional > 0)) {
            cards.push({
              ticker: underlying.ticker,
              name: underlying.name,
              rail: row.wrapper.rail,
              symbol: row.wrapper.symbol,
              perShare: quote?.ok && quote.perShare > 0 ? quote.perShare : null,
              reference: reference && reference > 0 ? reference : null,
              referenceLabel,
              grossPct: null,
              slipPct: null,
              costPct: null,
              feePct: null,
              netPct: null,
              complete: false,
              liquidity,
              status: row.status,
              vendor: quote?.vendorName,
              mode: quote?.executionMode,
              errorText: row.errorText || quote?.errorText,
              ...facts,
            });
            continue;
          }
          const edge = edgeBreakdown({
            perShare: quote.perShare,
            reference,
            slipBps: quote.slipBps50,
            slipKnown: quote.slipKnown,
            gasUsd: quote.gasUsd,
            notionalUsd: notional,
          });
          if (!edge) continue;
          cards.push({
            ticker: underlying.ticker,
            name: underlying.name,
            rail: row.wrapper.rail,
            symbol: row.wrapper.symbol,
            perShare: quote.perShare,
            reference,
            referenceLabel,
            grossPct: edge.grossPct,
            slipPct: edge.complete ? edge.slipPct : null,
            costPct: quote.networkFeeUsd == null && !(quote.gasUsd > 0) ? null : edge.costPct,
            feePct: null,
            netPct: edge.netPct,
            complete: edge.complete,
            liquidity,
            status: row.status,
            vendor: quote.vendorName,
            mode: quote.executionMode,
            ...facts,
          });
        }
      } catch {
        // One ticker failing must not blank the rest of the book.
      }
    }),
  );
  const ranked = rankOpportunities(cards);
  cache = { at: now, usdt, cards: ranked };
  return Response.json({ ok: true, cached: false, at: now, cards: ranked });
}
