"use client";

import { cardFromBook, evaluateLimits, flagReasons, limitsFromSettings } from "@parallax/core";
import { activeBook, underlyingName, useParallax } from "@/lib/store";

export function WhyFlagged() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const lockedRail = useParallax((s) => s.lockedRail);
  const priorClose = useParallax((s) => s.priorClose);
  const fridayClose = useParallax((s) => s.fridayClose);
  const stockReference = useParallax((s) => s.stockReference);
  const usdt = useParallax((s) => s.usdt);
  const settings = useParallax((s) => s.settings);
  const session = useParallax((s) => s.session);
  const demo = useParallax((s) => s.demo);
  const opportunities = useParallax((s) => s.opportunities);
  const active = activeBook({ books, best, lockedRail });
  const reference = priorClose ?? fridayClose ?? stockReference;
  const liveCard =
    active && reference
      ? cardFromBook(
          ticker,
          underlyingName(ticker),
          active,
          reference,
          "cash print",
          Number(usdt) || 10,
          opportunities.find((row) => row.ticker === ticker && row.rail === active.wrapper.rail)?.liquidity || 0,
        )
      : null;
  const card = demo ? demo.card : liveCard;
  const cashOpen = demo ? demo.cashOpen : session?.atmosphere === "open";
  const limits = limitsFromSettings(settings, Number(usdt) || 10);
  const lines = flagReasons({ cashOpen, card, limits, sizeUsdt: Number(usdt) || 10 });
  const gate = card ? evaluateLimits(card, limits, Number(usdt) || 10) : { pass: false, fails: ["No quote"] };

  return (
    <section className="border border-line px-4 py-4">
      <h2 className="kicker">Why Parallax flagged this</h2>
      {demo ? <p className="mt-2 text-[10px] tracking-[0.16em] text-gold">DEMO DATA</p> : null}
      <ol className="mt-3 space-y-2 text-sm">
        {lines.map((line, index) => (
          <li key={index} className="grid grid-cols-[1.5rem_1fr] gap-2">
            <span className="num text-dim">{index + 1}</span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
      <p className={`mt-4 text-[11px] tracking-[0.16em] ${gate.pass ? "text-up" : "text-down"}`}>
        {gate.pass ? "CONDITION MET · executable if you sign" : "HELD · does not clear risk controls"}
      </p>
    </section>
  );
}
