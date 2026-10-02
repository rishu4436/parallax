"use client";

import Link from "next/link";
import { formatPct, formatPx, gapPct } from "@parallax/core";
import { useMounted } from "@/lib/use-mounted";
import { useParallax } from "@/lib/store";

export function Landing() {
  const mounted = useMounted();
  const session = useParallax((s) => s.session);
  const ticker = useParallax((s) => s.ticker);
  const best = useParallax((s) => s.best);
  const fridayClose = useParallax((s) => s.fridayClose);
  const quoteError = useParallax((s) => s.quoteError);
  const quoting = useParallax((s) => s.quoting);
  const quote = best?.best;
  const gap = quote?.ok && fridayClose ? gapPct(quote.perShare, fridayClose) : null;

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-6 md:px-10">
      <main className="flex flex-1 flex-col justify-center py-12 md:py-20">
        <p className="kicker">Find the gap. Prove the opportunity. Execute it.</p>
        <h1 className="display mt-6 max-w-4xl text-5xl leading-[1.08] text-ink sm:text-6xl md:text-7xl">
          <span className="block">Cash freezes.</span>
          <span className="mt-2 block text-gold">BNB doesn’t.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-dim">
          Find tokenized-stock price gaps. Calculate the executable edge. Act through BNB Smart Chain. Trade the gap.
        </p>

        <div className="fog-target mt-14 grid gap-10 border-t border-line pt-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="kicker">Live lens · {ticker}</p>
            {quote?.ok ? (
              <>
                <p className="display num mt-4 text-5xl leading-none md:text-6xl">{formatPx(quote.perShare)}</p>
                <p className={`num mt-3 text-sm ${gap != null && gap >= 0 ? "text-up" : "text-down"}`}>
                  {gap == null ? "Friday ref unavailable" : `${formatPct(gap)} vs Friday cash close ${formatPx(fridayClose || 0)}`}
                </p>
                <p className="mt-2 text-xs text-dim">
                  {best?.wrapper.symbol} · {quote.vendorName} · {quote.executionMode}
                </p>
              </>
            ) : (
              <p className="mt-4 max-w-md text-xl text-down">{quoteError || (quoting ? "Reading the chain." : "No executable rail yet.")}</p>
            )}
          </div>
          <ol className="divide-y divide-line border-y border-line text-sm">
            <Rail n="01" name="bStocks" mark="B" copy="Suffix B. LiquidMesh swap, and an RFQ when the quote says so." />
            <Rail n="02" name="Ondo" mark="on" copy="Suffix on. Request-for-quote. Often dark outside US cash hours." />
            <Rail n="03" name="xStocks" mark="x" copy="Suffix x. An ordinary pool. It can stay open after the bell." />
          </ol>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link href="/desk" className="btn btn-primary px-6">
            ENTER THE DESK
          </Link>
          <p className="max-w-sm text-xs leading-relaxed text-dim">You sign in Binance Web3 Wallet. Fills land in that wallet. We never hold keys.</p>
        </div>
      </main>

      <footer className="flex flex-col gap-3 border-t border-line py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between">
        <p>Not advice. Tokens are not shares. No voting. Dividends rebase.</p>
        <p className="num">{mounted && session?.et ? `${session.et.ymd} · America/New_York` : "America/New_York"}</p>
      </footer>
    </div>
  );
}

function Rail({ n, name, mark, copy }: { n: string; name: string; mark: string; copy: string }) {
  return (
    <li className="grid grid-cols-[auto_auto_1fr] items-baseline gap-4 py-4">
      <span className="num text-[11px] text-dim">{n}</span>
      <span className="w-8 text-xs text-gold">{mark}</span>
      <span>
        <span className="block text-ink">{name}</span>
        <span className="mt-1 block text-dim">{copy}</span>
      </span>
    </li>
  );
}
