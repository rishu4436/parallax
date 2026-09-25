"use client";

import { useParallax } from "@/lib/store";

export function SessionStrip() {
  const session = useParallax((s) => s.session);
  const marketOpen = useParallax((s) => s.marketOpen);
  const cashOpen = session?.atmosphere === "open";
  const afterHours = !cashOpen;
  const hour = session?.et?.hour ?? 0;
  const minute = session?.et?.minute ?? 0;
  const mins = hour * 60 + minute;
  const openMin = 9 * 60 + 30;
  const closeMin = 16 * 60;
  const span = 24 * 60;
  const nowPct = Math.min(100, Math.max(0, (mins / span) * 100));
  const openPct = (openMin / span) * 100;
  const closePct = (closeMin / span) * 100;

  return (
    <section className="border border-line px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="kicker">US equity market</p>
          <p className={`mt-1 text-sm tracking-[0.14em] ${cashOpen ? "text-up" : "text-down"}`}>{cashOpen ? "OPEN" : "CLOSED"}</p>
        </div>
        <div>
          <p className="kicker">BNB Smart Chain</p>
          <p className="mt-1 text-sm tracking-[0.14em] text-up">OPEN</p>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-dim">
          {afterHours
            ? "Traditional trading is closed, but tokenized-stock liquidity remains available on-chain."
            : "Cash is in regular session. On-chain wrappers still print independently."}
        </p>
      </div>
      <div className="relative mt-4 h-1.5 bg-line">
        <span className="absolute top-0 h-full bg-gold/30" style={{ left: `${openPct}%`, width: `${closePct - openPct}%` }} />
        <span className="absolute top-[-3px] h-3 w-px bg-gold" style={{ left: `${nowPct}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] tracking-[0.12em] text-dim">
        <span>09:30 ET open</span>
        <span>16:00 ET cash close</span>
        <span className={afterHours ? "text-gold" : ""}>16:01+ on-chain continues</span>
      </div>
      {afterHours ? (
        <p className="mt-3 text-[11px] tracking-[0.16em] text-gold">After-hours opportunity state</p>
      ) : marketOpen === false ? (
        <p className="mt-3 text-[11px] tracking-[0.16em] text-down">On-chain RWA flag is closed for this wrapper.</p>
      ) : null}
    </section>
  );
}
