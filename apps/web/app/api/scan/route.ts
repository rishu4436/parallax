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
          let liquidity = 0;
          try {
            const print = await fetchMarketPrint(row.wrapper.address);
            liquidity = print.volume || 0;
          } catch {
            liquidity = 0;
          }
          if (!quote?.ok || !reference || !(notional > 0)) {
            cards.push({
              ticker: underlying.ticker,
              name: underlying.name,
              rail: row.wrapper.rail,
              symbol: row.wrapper.symbol,
              perShare: quote?.perShare || 0,
              reference: reference || 0,
              referenceLabel,
              grossPct: 0,
              slipPct: 0,
              costPct: 0,
              feePct: 0,
              netPct: 0,
              complete: false,
              liquidity,
              status: row.status,
              vendor: quote?.vendorName,
              mode: quote?.executionMode,
              errorText: row.errorText,
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
            slipPct: edge.slipPct,
            costPct: edge.costPct,
            feePct: edge.feePct,
            netPct: edge.netPct,
            complete: edge.complete,
            liquidity,
            status: row.status,
            vendor: quote.vendorName,
            mode: quote.executionMode,
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
