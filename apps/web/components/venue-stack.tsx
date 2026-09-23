"use client";

import { formatPx, formatQty, fromBaseUnits, type RailBook } from "@parallax/core";
import { activeBook, executableLine, useParallax } from "@/lib/store";

const ISSUER: Record<string, string> = { bStock: "bStocks", ondo: "Ondo", xStock: "xStocks" };

export function VenueStack() {
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const lockedRail = useParallax((s) => s.lockedRail);
  const lockRail = useParallax((s) => s.lockRail);
  const openConfirm = useParallax((s) => s.openConfirm);
  const quoting = useParallax((s) => s.quoting);
  const usdt = useParallax((s) => s.usdt);
  const setUsdt = useParallax((s) => s.setUsdt);
  const active = activeBook({ books, best, lockedRail });
  const line = executableLine(active, best);

  return (
    <div className="mt-2 border-t border-line">
      {books.map((book) => (
        <RailRow key={book.wrapper.rail} book={book} hot={active?.wrapper.rail === book.wrapper.rail && book.status === "OPEN"} onPick={() => lockRail(book.wrapper.rail)} />
      ))}
      {!books.length ? <p className="text-sm text-dim">{quoting ? "Asking BSC for every wrapper." : "Name a company. We will price every BNB wrapper."}</p> : null}
      {line ? <p className="num py-3 text-xs tracking-[0.14em] text-gold">{line}</p> : null}
      <label className="mt-3 grid max-w-xs gap-1 text-xs text-dim">
        Size USDT · your trades are not capped
        <input
          value={usdt}
          inputMode="decimal"
          onChange={(event) => setUsdt(event.target.value)}
          className="num h-10 border border-line bg-transparent px-3 text-sm text-ink"
        />
      </label>
      <div className="flex gap-3 pt-3">
        <button
          className="h-12 flex-1 bg-gold text-xs font-medium tracking-[0.22em] text-bg transition-colors duration-150 hover:bg-goldDim disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!active?.best?.ok}
          onClick={() => active && void openConfirm(active, "buy")}
        >
          BUY
        </button>
        <button
          className="h-12 flex-1 border border-line text-xs tracking-[0.22em] transition-colors duration-150 hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!active?.best?.ok}
          onClick={() => active && void openConfirm(active, "sell")}
        >
          SELL
        </button>
      </div>
    </div>
  );
}

function RailRow({ book, hot, onPick }: { book: RailBook; hot: boolean; onPick: () => void }) {
  const quote = book.best;
  const qty = quote?.ok ? formatQty(fromBaseUnits(quote.outAmount, book.wrapper.decimals)) : "—";
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
        <span className="num block text-[11px] text-dim">{quote?.ok ? `~${qty}` : ""}</span>
      </span>
    </button>
  );
}

function Badge({ children, tone = "dim" }: { children: React.ReactNode; tone?: "up" | "down" | "dim" }) {
  const color = tone === "up" ? "text-up border-up/30" : tone === "down" ? "text-down border-down/40" : "text-dim border-line";
  return <span className={`rounded-full border px-2 py-0.5 ${color}`}>{children}</span>;
}
