"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cashSession, formatPct, formatPx, gapPct } from "@parallax/core";
import { useMounted } from "@/lib/use-mounted";
import { Mark } from "./mark";

interface Live {
  symbol?: string;
  perShare?: number;
  vendor?: string;
  mode?: string;
  friday?: number | null;
  error?: string;
  status?: string;
}

export function Landing() {
  const mounted = useMounted();
  const [now, setNow] = useState<ReturnType<typeof cashSession> | null>(null);
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    setNow(cashSession());
    const id = setInterval(() => setNow(cashSession()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: "NVDA", usdt: "10", side: "buy" }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        book?: {
          fridayClose: number | null;
          best?: { wrapper?: { symbol?: string }; best?: { perShare?: number; vendorName?: string; executionMode?: string; ok?: boolean } };
          books?: Array<{ status?: string; errorText?: string; wrapper?: { symbol?: string }; best?: { ok?: boolean } }>;
        };
      };
      if (stop) return;
      const quote = body.book?.best?.best;
      const closed = body.book?.books?.find((row) => row.status !== "OPEN");
      setLive({
        symbol: body.book?.best?.wrapper?.symbol,
        perShare: quote?.ok ? quote.perShare : undefined,
        vendor: quote?.vendorName,
        mode: quote?.executionMode,
        friday: body.book?.fridayClose,
        status: body.book?.best ? "OPEN" : closed?.status,
        error: quote?.ok ? undefined : body.message || closed?.errorText,
      });
    }
    void load();
    const id = setInterval(() => void load(), 20000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const gap = live?.perShare && live.friday ? gapPct(live.perShare, live.friday) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 md:px-10">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Mark />
        <div className="flex items-center gap-5">
          <p className="kicker hidden md:block">{mounted && now ? now.chip : "US cash"}</p>
          <Link href="/desk" className="shrink-0 text-xs tracking-[0.18em] text-gold">
            ENTER THE DESK
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16 md:py-24">
        <p className="kicker">BNB Smart Chain · tokenized US stocks</p>
        <h1 className="display mt-6 max-w-4xl text-5xl leading-[1.08] text-ink sm:text-6xl md:text-7xl">
          <span className="block">Cash freezes.</span>
          <span className="mt-2 block text-gold">BNB doesn’t.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-dim">
          The cash market stops at 16:00 New York. The same names keep printing on chain, as three different tokens, three prices, three hour-rules. Trade the gap.
        </p>

        <div className="fog-target mt-14 grid gap-10 border-t border-line pt-8 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="kicker">Live lens · NVIDIA</p>
            {live?.perShare ? (
              <>
                <p className="display num mt-4 text-5xl leading-none md:text-6xl">{formatPx(live.perShare)}</p>
                <p className={`num mt-3 text-sm ${gap != null && gap >= 0 ? "text-up" : "text-down"}`}>
                  {gap == null ? "Friday ref unavailable" : `${formatPct(gap)} vs Friday cash close ${formatPx(live.friday || 0)}`}
                </p>
                <p className="mt-2 text-xs text-dim">
                  {live.symbol} · {live.vendor} · {live.mode}
                </p>
              </>
            ) : (
              <p className="mt-4 max-w-md text-xl text-down">{live?.error || "Reading the chain."}</p>
            )}
          </div>
          <ol className="divide-y divide-line border-y border-line text-sm">
            <Rail n="01" name="bStocks" mark="B" copy="Suffix B. LiquidMesh swap, and an RFQ when the quote says so." />
            <Rail n="02" name="Ondo" mark="on" copy="Suffix on. Request-for-quote. Often dark outside US cash hours." />
            <Rail n="03" name="xStocks" mark="x" copy="Suffix x. An ordinary pool. It can stay open after the bell." />
          </ol>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link href="/desk" className="bg-gold px-6 py-3 text-sm font-medium tracking-[0.18em] text-bg transition-colors duration-150 hover:bg-goldDim">
            ENTER THE DESK
          </Link>
          <p className="max-w-sm text-xs leading-relaxed text-dim">You sign in Binance Web3 Wallet. Fills land in that wallet. We never hold keys.</p>
        </div>
      </main>

      <footer className="flex flex-col gap-3 border-t border-line py-6 text-xs text-dim sm:flex-row sm:items-center sm:justify-between">
        <p>Not advice. Tokens are not shares. No voting. Dividends rebase.</p>
        <p className="num">{mounted && now ? `${now.et.ymd} · America/New_York` : "America/New_York"}</p>
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
