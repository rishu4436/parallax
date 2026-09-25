"use client";

import { formatPct, formatPx, type OpportunityCard } from "@parallax/core";
import { useEffect } from "react";
import { useParallax } from "@/lib/store";

export function OpportunityEngine() {
  const cards = useParallax((s) => s.opportunities);
  const scanning = useParallax((s) => s.scanning);
  const refreshScan = useParallax((s) => s.refreshScan);
  const selectTicker = useParallax((s) => s.selectTicker);
  const setAnalyzeOpen = useParallax((s) => s.setAnalyzeOpen);
  const ticker = useParallax((s) => s.ticker);

  useEffect(() => {
    void refreshScan();
    const id = setInterval(() => void refreshScan(), 40_000);
    return () => clearInterval(id);
  }, [refreshScan]);

  const ranked = cards.filter((row) => row.status === "OPEN" && Math.abs(row.netPct) > 0);
  const shown = (ranked.length ? ranked : cards).slice(0, 6);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="kicker">Opportunity engine</h2>
        <span className="text-[11px] text-dim">{scanning ? "Scanning BSC" : `${cards.length} wrappers`}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-dim">Ranked by |net edge| on OPEN rails. Net = gross − slip − gas. Fees stay blank until the quote returns them.</p>
      <ul className="mt-4 space-y-3">
        {shown.map((card) => (
          <li key={`${card.ticker}-${card.rail}`}>
            <button
              className={`w-full border px-3 py-3 text-left ${card.ticker === ticker ? "border-gold" : "border-line"}`}
              onClick={() => {
                void selectTicker(card.ticker, card.rail);
                setAnalyzeOpen(true);
              }}
            >
              <CardBody card={card} />
            </button>
          </li>
        ))}
      </ul>
      {!shown.length ? <p className="mt-3 text-sm text-dim">{scanning ? "Asking every seeded wrapper." : "No scan yet."}</p> : null}
    </section>
  );
}

function CardBody({ card }: { card: OpportunityCard }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm">
          {card.ticker} <span className="text-dim">{card.symbol}</span>
        </span>
        <span className={`num text-sm ${card.netPct >= 0 ? "text-up" : "text-down"}`}>{formatPct(card.netPct)}</span>
      </div>
      <p className="num mt-1 text-[11px] text-dim">
        {formatPx(card.perShare)} vs {formatPx(card.reference)} · gross {formatPct(card.grossPct)}
      </p>
      <p className="num mt-1 text-[11px] text-dim">
        slip {card.complete ? formatPct(card.slipPct) : "—"} · gas {formatPct(card.costPct)} · liq {card.liquidity ? card.liquidity.toFixed(0) : "—"}
      </p>
      <p className="mt-2 text-[10px] tracking-[0.16em] text-gold">{card.status === "OPEN" ? "OPPORTUNITY DETECTED" : card.status}</p>
    </>
  );
}
