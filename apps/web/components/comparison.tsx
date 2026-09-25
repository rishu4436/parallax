"use client";

import { formatPct, formatPx, gapPct, type RailBook } from "@parallax/core";
import { edgeBreakdown } from "@parallax/core";
import { useParallax } from "@/lib/store";

const ISSUER: Record<string, string> = { bStock: "bStocks", ondo: "Ondo", xStock: "xStocks" };

export function Comparison() {
  const books = useParallax((s) => s.books);
  const ticker = useParallax((s) => s.ticker);
  const priorClose = useParallax((s) => s.priorClose);
  const fridayClose = useParallax((s) => s.fridayClose);
  const stockReference = useParallax((s) => s.stockReference);
  const usdt = useParallax((s) => s.usdt);
  const lockRail = useParallax((s) => s.lockRail);
  const reference = priorClose ?? fridayClose ?? stockReference;
  const referenceLabel = priorClose ? "Reference / prior close" : fridayClose ? "Reference / Friday close" : "Reference";
  const notional = Number(usdt) || 10;
  const rows = books.map((book) => rowOf(book, reference, notional));
  const open = rows.filter((row) => row.open && row.perShare != null);
  const largestPremium = [...open].sort((a, b) => (b.gross ?? 0) - (a.gross ?? 0))[0];
  const largestDiscount = [...open].sort((a, b) => (a.gross ?? 0) - (b.gross ?? 0))[0];
  const lowestSlip = [...open].filter((row) => row.slipKnown).sort((a, b) => (a.slipPct ?? 99) - (b.slipPct ?? 99))[0];
  const bestNet = [...open].sort((a, b) => Math.abs(b.net ?? 0) - Math.abs(a.net ?? 0))[0];
  const maxAbs = Math.max(1, ...open.map((row) => Math.abs(row.gross ?? 0)));

  return (
    <section className="border-t border-line pt-6">
      <p className="kicker">Wrapper comparison · {ticker}</p>
      <p className="num mt-3 text-sm text-dim">
        {referenceLabel} {reference ? formatPx(reference) : "—"}
      </p>
      <div className="mt-4 space-y-4">
        {rows.map((row) => {
          const width = row.gross == null ? 0 : (Math.abs(row.gross) / maxAbs) * 100;
          return (
            <button key={row.rail} onClick={() => lockRail(row.rail)} className="grid w-full grid-cols-[7rem_1fr_auto] items-center gap-3 text-left">
              <span>
                <span className="block text-sm">{ISSUER[row.rail]}</span>
                <span className="text-[11px] text-dim">{row.symbol}</span>
              </span>
              <span className="relative h-2 bg-line">
                <span
                  className={`absolute top-0 h-full ${row.gross != null && row.gross >= 0 ? "bg-up" : "bg-down"}`}
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="num text-right text-sm">
                <span className="block">{row.perShare != null ? formatPx(row.perShare) : "—"}</span>
                <span className={`block text-[11px] ${row.gross != null && row.gross >= 0 ? "text-up" : "text-down"}`}>
                  {row.gross == null ? row.status : formatPct(row.gross)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <dl className="mt-5 grid gap-2 text-xs text-dim sm:grid-cols-2">
        <Stat label="Largest premium" value={largestPremium ? `${largestPremium.symbol} ${formatPct(largestPremium.gross || 0)}` : "—"} />
        <Stat label="Largest discount" value={largestDiscount ? `${largestDiscount.symbol} ${formatPct(largestDiscount.gross || 0)}` : "—"} />
        <Stat label="Lowest measured slip" value={lowestSlip ? `${lowestSlip.symbol} ${formatPct(lowestSlip.slipPct || 0)}` : "—"} />
        <Stat label="Largest executable net" value={bestNet ? `${bestNet.symbol} ${formatPct(bestNet.net || 0)}` : "—"} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2">
      <dt>{label}</dt>
      <dd className="num text-ink">{value}</dd>
    </div>
  );
}

function rowOf(book: RailBook, reference: number | null, notional: number) {
  const quote = book.best;
  const perShare = quote?.ok ? quote.perShare : null;
  const gross = perShare && reference ? gapPct(perShare, reference) : null;
  const edge =
    perShare && reference && quote
      ? edgeBreakdown({
          perShare,
          reference,
          slipBps: quote.slipBps50,
          slipKnown: quote.slipKnown,
          gasUsd: quote.gasUsd,
          notionalUsd: notional,
        })
      : null;
  return {
    rail: book.wrapper.rail,
    symbol: book.wrapper.symbol,
    status: book.status,
    perShare,
    gross,
    net: edge?.netPct ?? null,
    slipPct: edge?.slipPct ?? null,
    slipKnown: quote?.slipKnown ?? false,
    open: book.status === "OPEN",
  };
}
