"use client";

import type { ReactNode } from "react";
import { edgeBreakdown, formatPct, formatPx, formatQty, fromBaseUnits, limitsFromSettings } from "@parallax/core";
import { activeBook, useParallax } from "@/lib/store";

export function TradeTicket() {
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const lockedRail = useParallax((s) => s.lockedRail);
  const ticker = useParallax((s) => s.ticker);
  const side = useParallax((s) => s.side);
  const usdt = useParallax((s) => s.usdt);
  const setUsdt = useParallax((s) => s.setUsdt);
  const priorClose = useParallax((s) => s.priorClose);
  const fridayClose = useParallax((s) => s.fridayClose);
  const stockReference = useParallax((s) => s.stockReference);
  const settings = useParallax((s) => s.settings);
  const quoting = useParallax((s) => s.quoting);
  const confirm = useParallax((s) => s.confirm);
  const demo = useParallax((s) => s.demo);
  const active = activeBook({ books, best, lockedRail });
  const quote = active?.best;
  const reference = priorClose ?? fridayClose ?? stockReference;
  const notional = Number(usdt);
  const validSize = Number.isFinite(notional) && notional > 0;
  const edge =
    quote?.ok && reference && validSize
      ? edgeBreakdown({
          perShare: quote.perShare,
          reference,
          slipBps: quote.slipBps50,
          slipKnown: quote.slipKnown,
          gasUsd: quote.gasUsd,
          notionalUsd: notional,
        })
      : null;
  const limits = limitsFromSettings(settings, validSize ? notional : 10);
  const qty = quote?.ok ? formatQty(fromBaseUnits(quote.outAmount, quote.wrapper.decimals)) : "—";
  const sim =
    confirm?.result?.step === "sign-swap"
      ? confirm.result.simulateStatus
      : confirm?.result?.step === "sign-rfq"
        ? "RFQ · no EVM simulate"
        : confirm?.preparing
          ? "PREPARING"
          : null;

  return (
    <section className="mt-4 border border-line px-4 py-4">
      <h2 className="kicker">Trade ticket</h2>
      {!validSize ? <p className="mt-2 text-xs text-down">Enter a size greater than zero.</p> : null}
      {validSize && notional > limits.maxTradeUsdt ? (
        <p className="mt-2 text-xs text-down">Size is above the {limits.maxTradeUsdt} USDT risk cap. Jobs use this cap. Manual TRADE still asks you to sign.</p>
      ) : null}
      <dl className="mt-3 grid gap-2 text-xs">
        <Row label="Asset" value={`${ticker} · ${quote?.wrapper.symbol || "—"}`} />
        <Row label="Side" value={side.toUpperCase()} />
        <Row
          label="Amount USDT"
          value=""
          extra={
            <input
              value={usdt}
              inputMode="decimal"
              onChange={(event) => setUsdt(event.target.value)}
              className="num h-8 w-28 border border-line bg-transparent px-2 text-right"
            />
          }
        />
        <Row label="Execution price" value={quote?.ok ? formatPx(quote.perShare) : quoting ? "quoting" : "—"} />
        <Row label="Est. tokens" value={qty} />
        <Row label="Price impact" value={quote?.slipKnown ? `${quote.slipBps50} bps` : "—"} />
        <Row label="Trading fee" value="—" hint="Aggregator tradeFee is not on this quote." />
        <Row label="Gas" value={quote?.gasUsd ? formatPx(quote.gasUsd) : "—"} />
        <Row label="Notional" value={validSize ? formatPx(notional) : "—"} />
        <Row label="Estimated net edge" value={edge ? formatPct(edge.netPct) : "—"} />
      </dl>
      {sim ? (
        <p className={`mt-3 text-[11px] tracking-[0.14em] ${sim === "SUCCESS" ? "text-up" : sim === "FAILED" ? "text-down" : "text-gold"}`}>
          SIMULATION STATUS {sim}
        </p>
      ) : (
        <p className="mt-3 text-[11px] text-dim">SIMULATE runs prepare. SUCCESS means the EVM sim passed, not that a fill landed.</p>
      )}
      {demo ? <p className="mt-2 text-[10px] tracking-[0.16em] text-gold">DEMO DATA · this ticket is illustrative</p> : null}
    </section>
  );
}

function Row({ label, value, hint, extra }: { label: string; value: string; hint?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5">
      <dt className="text-dim">{label}</dt>
      <dd className="num flex items-center gap-2 text-ink">
        {extra}
        {value}
      </dd>
      {hint ? <span className="sr-only">{hint}</span> : null}
    </div>
  );
}
