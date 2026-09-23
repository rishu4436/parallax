"use client";

import { formatPx, formatQty, formatUsd, gapPct, type Rail } from "@parallax/core";
import { useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { useAccount } from "wagmi";
import { COPY } from "@parallax/core";

const LETTER: Record<Rail, string> = { bStock: "B", ondo: "on", xStock: "x" };

export function PortfolioDock() {
  const portfolio = useParallax((s) => s.portfolio);
  const books = useParallax((s) => s.books);
  const fridayClose = useParallax((s) => s.fridayClose);
  const priorClose = useParallax((s) => s.priorClose);
  const priorDate = useParallax((s) => s.priorDate);
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const mids = new Map(books.filter((book) => book.best?.ok).map((book) => [book.wrapper.symbol, book.best!.perShare]));
  const held = (portfolio?.lines ?? []).filter((line) => line.rail && line.amount > 0);
  const stables = (portfolio?.lines ?? []).filter((line) => !line.rail && line.amount > 0);
  const total = held.reduce((sum, line) => sum + line.amount * (mids.get(line.symbol) || 0), 0);

  return (
    <section id="portfolio">
      <div className="flex items-baseline justify-between">
        <h2 className="kicker">Portfolio</h2>
        <p className="display num text-3xl">{held.length ? formatUsd(total) : "—"}</p>
      </div>
      {mounted && !isConnected ? <p className="mt-3 text-sm text-dim">{COPY.connect}</p> : null}
      {mounted && isConnected && held.length === 0 ? <p className="mt-3 text-sm text-dim">No wrappers in this wallet.</p> : null}
      <ul className="mt-3 space-y-2">
        {held.map((line) => {
          const px = mids.get(line.symbol);
          const usd = px ? line.amount * px : null;
          const ref = priorClose ?? fridayClose;
          const gap = px && ref ? gapPct(px, ref) : null;
          const gapLabel = priorDate ? "prior close" : "Friday";
          return (
            <li key={line.address} className="flex items-center justify-between text-sm">
              <span>
                <span className="mr-2 text-xs text-dim">{line.rail ? LETTER[line.rail] : ""}</span>
                {line.symbol}
              </span>
              <span className="num text-right">
                <span className="block">{formatQty(line.amount)}</span>
                <span className="block text-xs text-dim">
                  {usd == null ? "—" : formatUsd(usd)}
                  {gap == null ? "" : ` · ${gap >= 0 ? "+" : ""}${gap.toFixed(2)}% vs ${gapLabel}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t border-line pt-3 text-xs text-dim">
        {stables.map((line) => (
          <p key={line.symbol} className="num flex justify-between">
            <span>{line.symbol}</span>
            <span>{line.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
          </p>
        ))}
        <p className="num flex justify-between">
          <span>BNB gas</span>
          <span>{portfolio ? formatQty(portfolio.bnb) : "—"}</span>
        </p>
        {portfolio?.walletApiError ? <p className="mt-2 text-down">Wallet API {portfolio.walletApiError}</p> : null}
      </div>
      <p className="sr-only">{formatPx(0)}</p>
    </section>
  );
}
