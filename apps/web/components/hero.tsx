"use client";

import { COPY, formatPct, formatPx, gapPct, getUnderlying, relativePct, shortYmd, wrapperList } from "@parallax/core";
import { activeBook, underlyingName, useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { useAccount } from "wagmi";

export function Hero() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayDate = useParallax((s) => s.fridayDate);
  const priorClose = useParallax((s) => s.priorClose);
  const priorOpen = useParallax((s) => s.priorOpen);
  const priorDate = useParallax((s) => s.priorDate);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const lockedRail = useParallax((s) => s.lockedRail);
  const quoteError = useParallax((s) => s.quoteError);
  const quoting = useParallax((s) => s.quoting);
  const candles = useParallax((s) => s.candles);
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const underlying = getUnderlying(ticker);
  const active = activeBook({ books, best, lockedRail });
  const quote = active?.best;
  const allClosed = books.length > 0 && books.every((book) => book.status === "CLOSED" || book.status === "HALTED");
  const vsPriorClose = quote?.ok ? gapPct(quote.perShare, priorClose) : null;
  const vsPriorOpen = quote?.ok ? gapPct(quote.perShare, priorOpen) : null;
  const vsSessionOpen = quote?.ok ? gapPct(quote.perShare, sessionOpen) : null;
  const vsFriday = quote?.ok ? gapPct(quote.perShare, fridayClose) : null;
  const primaryGap = vsPriorClose ?? vsFriday;
  const primaryPx = priorClose ?? fridayClose;
  const primaryLabel = priorDate
    ? `prior close ${shortYmd(priorDate)}`
    : fridayDate
      ? `Friday cash close ${shortYmd(fridayDate)}`
      : "Friday cash close";
  const showFriday = Boolean(vsFriday != null && fridayDate && fridayDate !== priorDate);
  const others = books.filter((book) => book.wrapper.rail !== active?.wrapper.rail && book.best?.ok && quote?.ok);

  const price = quote?.ok ? formatPx(quote.perShare) : null;
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="kicker">Underlying</p>
          <h1 className="display mt-2 text-4xl leading-none md:text-5xl">{underlyingName(ticker)}</h1>
        </div>
        <p className="kicker hidden md:block">{ticker}</p>
      </div>
      <div className="fog-target mt-6">
        {mounted && !isConnected ? <p className="mb-4 max-w-md text-sm text-dim">{COPY.connect}</p> : null}
        {price ? (
          <>
            <p className="display num text-5xl leading-none sm:text-6xl md:text-7xl">{price}</p>
            {primaryGap == null || !primaryPx ? (
              <p className="mt-4 text-sm text-dim">{COPY.priorMissing}</p>
            ) : (
              <p className={`num mt-4 text-sm ${primaryGap >= 0 ? "text-up" : "text-down"}`}>
                {formatPct(primaryGap)} vs {primaryLabel} {formatPx(primaryPx)}
              </p>
            )}
            <p className="num mt-2 text-xs text-dim">
              {[
                vsPriorOpen != null && priorOpen && priorDate ? `${formatPct(vsPriorOpen)} vs prior open ${shortYmd(priorDate)} ${formatPx(priorOpen)}` : null,
                vsSessionOpen != null && sessionOpen && sessionOpenDate
                  ? `${formatPct(vsSessionOpen)} vs session open ${shortYmd(sessionOpenDate)} ${formatPx(sessionOpen)}`
                  : null,
                showFriday && fridayClose ? `${formatPct(vsFriday as number)} vs Friday close ${formatPx(fridayClose)}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
            <p className="num mt-2 text-xs text-dim">
              {others.length
                ? others
                    .map((book) => {
                      const rel = relativePct(quote!.perShare, book.best!.perShare);
                      return `vs ${book.wrapper.symbol} ${rel == null ? "—" : formatPct(rel)}`;
                    })
                    .join("  ·  ")
                : quoting
                  ? "Quoting every wrapper"
                  : null}
            </p>
          </>
        ) : (
          <div>
            <p className="display max-w-xl text-3xl leading-tight text-down md:text-4xl">
              {allClosed ? COPY.allClosed : quoteError || active?.errorText || books[0]?.errorText || (quoting ? "Quoting BSC" : COPY.emptySearch)}
            </p>
            <p className="mt-3 text-sm text-dim">
              {priorClose && priorDate
                ? `Prior close ${shortYmd(priorDate)} ${formatPx(priorClose)}`
                : fridayClose
                  ? `Friday cash close ${formatPx(fridayClose)}`
                  : COPY.priorMissing}
            </p>
          </div>
        )}
      </div>
      <p className="kicker mt-8">vs cash prints</p>
      <Spark candles={candles} prior={priorClose} friday={fridayDate !== priorDate ? fridayClose : null} multiplier={active?.wrapper.multiplier || 1} />
      <p className="sr-only">{wrapperList(underlying || { ticker, name: ticker, wrappers: {} }).length}</p>
    </div>
  );
}

function Spark({
  candles,
  prior,
  friday,
  multiplier,
}: {
  candles: { c: number }[];
  prior: number | null;
  friday: number | null;
  multiplier: number;
}) {
  if (!candles.length) return <div className="mt-4 h-16 text-xs text-dim">24h print loads with the rail.</div>;
  const values = candles.map((candle) => candle.c);
  const priorRef = prior ? prior * multiplier : null;
  const fridayRef = friday ? friday * multiplier : null;
  const min = Math.min(...values, priorRef ?? Infinity, fridayRef ?? Infinity);
  const max = Math.max(...values, priorRef ?? -Infinity, fridayRef ?? -Infinity);
  const span = max - min || 1;
  const w = 320;
  const h = 64;
  const step = w / Math.max(1, values.length - 1);
  const d = values
    .map((value, index) => {
      const x = index * step;
      const y = h - ((value - min) / span) * (h - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const yOf = (ref: number | null) => (ref == null ? null : h - ((ref - min) / span) * (h - 4) - 2);
  const priorY = yOf(priorRef);
  const fridayY = yOf(fridayRef);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-20 w-full" role="img" aria-label="24h rail versus prior cash close">
      {fridayY != null ? <line x1="0" x2={w} y1={fridayY} y2={fridayY} stroke="#8B909A" strokeDasharray="1 5" /> : null}
      {priorY != null ? <line x1="0" x2={w} y1={priorY} y2={priorY} stroke="#8B909A" strokeDasharray="2 4" /> : null}
      <path d={d} fill="none" stroke="#F0B90B" strokeWidth="1.25" />
    </svg>
  );
}
