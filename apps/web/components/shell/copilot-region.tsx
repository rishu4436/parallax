"use client";

import { useEffect, useState } from "react";
import { cardFromBook, cashSession, formatPct } from "@parallax/core";
import { Copilot } from "@/components/copilot";
import { Drawer } from "@/components/ui/overlay";
import { underlyingName, useParallax } from "@/lib/store";

export function CopilotRegion() {
  const open = useParallax((s) => s.copilotOpen);
  const setOpen = useParallax((s) => s.setCopilotOpen);
  const [wide, setWide] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const body = (
    <>
      <CopilotContext />
      <div className="mt-6">
        <Copilot />
      </div>
    </>
  );

  if (wide === null) {
    return <aside className="hidden w-80 shrink-0 desk:flex" aria-hidden />;
  }

  if (wide) {
    return <aside className="flex w-80 shrink-0 flex-col overflow-auto border-l border-line px-5 py-6">{body}</aside>;
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} kicker="Ask the book" title="Copilot" description="Answers use live quotes on this desk. The model does not sign.">
      {body}
    </Drawer>
  );
}

function CopilotContext() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const priorClose = useParallax((s) => s.priorClose);
  const fridayClose = useParallax((s) => s.fridayClose);
  const usdt = useParallax((s) => s.usdt);
  const session = useParallax((s) => s.session);
  const beat = useParallax((s) => s.beat);
  const quoting = useParallax((s) => s.quoting);
  const book = best || books.find((row) => row.best?.ok) || null;
  const reference = priorClose ?? fridayClose ?? 0;
  const card =
    book && reference > 0 ? cardFromBook(ticker, underlyingName(ticker), book, reference, priorClose ? "prior close" : "Friday cash close", Number(usdt) || 10) : null;
  const cashOpen = session?.atmosphere === "open" || (!session && cashSession().atmosphere === "open");

  return (
    <div>
      <p className="kicker">Context</p>
      <p className="mt-2 text-sm text-ink">
        {underlyingName(ticker)} · {ticker}
      </p>
      <p className="mt-2 text-xs text-dim">
        US {cashOpen ? "OPEN" : "CLOSED"} · BSC OPEN · worker {beat?.status === "live" ? "live" : "stopped"}
      </p>
      <p className="num mt-2 text-sm">{quoting ? "Quoting" : card ? `NET ${formatPct(card.netPct)} · ${card.symbol}` : "No executable rail yet"}</p>
    </div>
  );
}
