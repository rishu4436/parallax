"use client";

import { formatPct, formatPx, formatQty, fromBaseUnits, gapPct, needsSignerQuote, type RailBook } from "@parallax/core";
import { useAccount } from "wagmi";
import { activeBook, executableLine, useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";

const ISSUER: Record<string, string> = { bStock: "bStocks", ondo: "Ondo", xStock: "xStocks" };

export function VenueStack() {
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const lockedRail = useParallax((s) => s.lockedRail);
  const lockRail = useParallax((s) => s.lockRail);
  const openConfirm = useParallax((s) => s.openConfirm);
  const askConnect = useParallax((s) => s.askConnect);
  const fridayClose = useParallax((s) => s.fridayClose);
  const priorClose = useParallax((s) => s.priorClose);
  const quoting = useParallax((s) => s.quoting);
  const usdt = useParallax((s) => s.usdt);
  const setUsdt = useParallax((s) => s.setUsdt);
  const setAnalyzeOpen = useParallax((s) => s.setAnalyzeOpen);
  const analyzeOpen = useParallax((s) => s.analyzeOpen);
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const active = activeBook({ books, best, lockedRail });
  const line = executableLine(active, best);
  const needsWallet = Boolean(mounted && active?.best && needsSignerQuote(active.best) && !isConnected);
  const refClose = fridayClose ?? priorClose;
  const refLabel = fridayClose ? "vs Friday" : "vs prior";

  function onTrade(side: "buy" | "sell") {
    if (!active?.best?.ok) return;
    if (needsWallet) {
      askConnect();
      return;
    }
    void openConfirm(active, side);
  }

  return (
    <div className="mt-2 border-t border-line">
      {books.map((book) => (
        <RailRow
          key={book.wrapper.rail}
          book={book}
          hot={active?.wrapper.rail === book.wrapper.rail && book.status === "OPEN"}
          refClose={refClose}
          refLabel={refLabel}
          onPick={() => lockRail(book.wrapper.rail)}
        />
      ))}
      {!books.length ? <p className="text-sm text-dim">{quoting ? "Asking BSC for every wrapper." : "Name a company. We will price every BNB wrapper."}</p> : null}
      {line && !needsWallet ? <p className="num py-3 text-xs tracking-[0.14em] text-gold">{line}</p> : null}
      <label className="mt-3 grid max-w-xs gap-1 text-xs text-dim">
        Size USDT · your trades are not capped
        <input
          value={usdt}
          inputMode="decimal"
          onChange={(event) => setUsdt(event.target.value)}
          className="num h-10 border border-line bg-transparent px-3 text-sm text-ink"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          className={`h-12 border text-xs tracking-[0.18em] ${analyzeOpen ? "border-gold text-gold" : "border-line"}`}
          onClick={() => setAnalyzeOpen(!analyzeOpen)}
        >
          ANALYZE
        </button>
        <button
          className="h-12 border border-line text-xs tracking-[0.18em] disabled:opacity-40"
          disabled={!active?.best?.ok}
          onClick={() => onTrade("buy")}
        >
          SIMULATE
        </button>
        {needsWallet ? (
          <button
            className="col-span-2 h-12 bg-gold text-xs font-medium tracking-[0.16em] text-bg hover:bg-goldDim disabled:opacity-40 sm:col-span-2"
            disabled={!active?.best?.ok}
            onClick={() => onTrade("buy")}
          >
            Connect Binance Web3 Wallet
          </button>
        ) : (
          <>
            <button
              className="h-12 bg-gold text-xs font-medium tracking-[0.22em] text-bg hover:bg-goldDim disabled:opacity-40"
              disabled={!active?.best?.ok}
              onClick={() => onTrade("buy")}
            >
              BUY
            </button>
            <button
              className="h-12 border border-line text-xs tracking-[0.22em] hover:border-ink disabled:opacity-40"
              disabled={!active?.best?.ok}
              onClick={() => onTrade("sell")}
            >
              SELL
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RailRow({
  book,
  hot,
  refClose,
  refLabel,
  onPick,
}: {
  book: RailBook;
  hot: boolean;
  refClose: number | null;
  refLabel: string;
  onPick: () => void;
}) {
  const quote = book.best;
  const qty = quote?.ok ? formatQty(fromBaseUnits(quote.outAmount, book.wrapper.decimals)) : "—";
  const gap = quote?.ok && refClose ? gapPct(quote.perShare, refClose) : null;
  return (
    <button
      onClick={onPick}
      className={`grid w-full grid-cols-[auto_1fr_auto] gap-4 border-b border-line py-4 text-left transition-colors duration-150 ${
        hot ? "border-l-2 border-l-gold pl-3" : "pl-1"
      }`}
    >
      <span className="mt-0.5 flex h-8 w-8 items-center justify-center border border-line text-[11px] text-gold">
        {book.wrapper.rail === "bStock" ? "B" : book.wrapper.rail === "ondo" ? "on" : "x"}
      </span>
      <span>
        <span className="flex items-center gap-2">
          <span className="text-sm">{ISSUER[book.wrapper.rail]}</span>
          <span className="text-xs text-dim">{book.wrapper.symbol}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          <Badge>{book.badge}</Badge>
          <Badge tone={book.status === "OPEN" ? "up" : book.status === "CLOSED" || book.status === "HALTED" ? "down" : "dim"}>{book.status}</Badge>
          <span className="num text-dim">slip {quote?.slipKnown ? `${quote.slipBps50} / ${quote.slipBps500}` : "— / —"}</span>
          <span className={`h-1.5 w-1.5 rounded-full ${book.status === "OPEN" ? "bg-up" : "bg-dim"}`} />
        </span>
        {book.errorText ? <span className="mt-1 block text-xs text-down">{book.errorText}</span> : null}
      </span>
      <span className="text-right">
        <span className="num block text-sm">{quote?.ok ? formatPx(quote.perShare) : "—"}</span>
        {gap != null ? <span className={`num block text-[11px] ${gap >= 0 ? "text-up" : "text-down"}`}>{formatPct(gap)} {refLabel}</span> : null}
        <span className="num block text-[11px] text-dim">{quote?.ok ? `~${qty}` : ""}</span>
      </span>
    </button>
  );
}

function Badge({ children, tone = "dim" }: { children: React.ReactNode; tone?: "up" | "down" | "dim" }) {
  const color = tone === "up" ? "text-up border-up/30" : tone === "down" ? "text-down border-down/40" : "text-dim border-line";
  return <span className={`rounded-full border px-2 py-0.5 ${color}`}>{children}</span>;
}
