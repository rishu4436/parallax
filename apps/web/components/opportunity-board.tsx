"use client";

import { cardFromBook, formatPct, formatPx } from "@parallax/core";
import { activeBook, underlyingName, useParallax } from "@/lib/store";
import { useAccount } from "wagmi";
import { useMounted } from "@/lib/use-mounted";

export function OpportunityBoard() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const best = useParallax((s) => s.best);
  const lockedRail = useParallax((s) => s.lockedRail);
  const priorClose = useParallax((s) => s.priorClose);
  const fridayClose = useParallax((s) => s.fridayClose);
  const stockReference = useParallax((s) => s.stockReference);
  const priorDate = useParallax((s) => s.priorDate);
  const fridayDate = useParallax((s) => s.fridayDate);
  const usdt = useParallax((s) => s.usdt);
  const settings = useParallax((s) => s.settings);
  const session = useParallax((s) => s.session);
  const quoteAt = useParallax((s) => s.quoteAt);
  const quoting = useParallax((s) => s.quoting);
  const quoteError = useParallax((s) => s.quoteError);
  const demo = useParallax((s) => s.demo);
  const setAnalyzeOpen = useParallax((s) => s.setAnalyzeOpen);
  const analyzeOpen = useParallax((s) => s.analyzeOpen);
  const openConfirm = useParallax((s) => s.openConfirm);
  const askConnect = useParallax((s) => s.askConnect);
  const opportunities = useParallax((s) => s.opportunities);
  const mounted = useMounted();
  const { isConnected } = useAccount();

  const active = activeBook({ books, best, lockedRail });
  const reference = priorClose ?? fridayClose ?? stockReference;
  const referenceLabel = priorClose
    ? `prior close${priorDate ? ` ${priorDate}` : ""}`
    : fridayClose
      ? `Friday close${fridayDate ? ` ${fridayDate}` : ""}`
      : "TradFi reference";
  const liveCard = active && reference ? cardFromBook(ticker, underlyingName(ticker), active, reference, referenceLabel, Number(usdt) || 10, opportunities.find((row) => row.ticker === ticker && row.rail === active.wrapper.rail)?.liquidity || 0) : null;
  const card = demo ? demo.card : liveCard;
  const source = demo ? "DEMO DATA" : quoteAt ? `Binance Web3 quote · ${new Date(quoteAt).toISOString()}` : quoting ? "Quoting BSC" : "Waiting on a quote";
  const cashOpen = demo ? demo.cashOpen : session?.atmosphere === "open";

  function trade(side: "buy" | "sell") {
    if (demo) return;
    if (!active?.best?.ok) return;
    if (mounted && !isConnected) {
      askConnect();
      return;
    }
    void openConfirm(active, side);
  }

  return (
    <section className="border border-gold/40 px-4 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="kicker">Opportunity engine</h2>
        <span className={`text-[10px] tracking-[0.16em] ${demo ? "text-gold" : "text-dim"}`}>{source}</span>
      </div>
      <p className="display mt-3 text-3xl">{underlyingName(ticker)}</p>
      {quoteError && !demo ? <p className="mt-2 text-xs text-down">{quoteError}</p> : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Metric label="Reference price" value={card ? formatPx(card.reference) : "—"} />
        <Metric label="Tokenized price" value={card ? formatPx(card.perShare) : "—"} />
        <Metric label="Gross gap" value={card ? formatPct(card.grossPct) : "—"} tone={card && card.grossPct >= 0 ? "up" : "down"} />
        <Metric label="Estimated net edge" value={card ? formatPct(card.netPct) : "—"} tone={card && card.netPct >= 0 ? "up" : "down"} />
        <Metric label="Liquidity" value={card?.liquidity ? card.liquidity.toFixed(0) : "—"} />
        <Metric label="Est. slippage" value={card?.complete ? formatPct(card.slipPct) : "—"} />
        <Metric label="Fees + gas" value={card ? formatPct(card.costPct + card.feePct) : "—"} />
        <Metric
          label="Market status"
          value={`${cashOpen ? "US OPEN" : "US CLOSED"} · BSC OPEN`}
          tone={cashOpen ? "up" : "down"}
        />
      </dl>
      <p className="mt-3 text-[11px] text-dim">
        Net = gross − slip − gas. {settings ? `Threshold ${settings.minNetEdgePct}% net · max slip ${settings.maxSlipPct}%.` : ""} Approval required.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className={`h-11 border text-[11px] tracking-[0.16em] ${analyzeOpen ? "border-gold text-gold" : "border-line"}`} onClick={() => setAnalyzeOpen(!analyzeOpen)}>
          ANALYZE
        </button>
        <button className="h-11 border border-line text-[11px] tracking-[0.16em] disabled:opacity-40" disabled={!active?.best?.ok && !demo} onClick={() => trade("buy")}>
          SIMULATE
        </button>
        <button className="h-11 bg-gold text-[11px] tracking-[0.16em] text-bg disabled:opacity-40" disabled={!active?.best?.ok && !demo} onClick={() => trade("buy")}>
          TRADE
        </button>
      </div>
      {demo ? <p className="mt-3 text-[11px] tracking-[0.16em] text-gold">DEMO DATA · {demo.label}. TRADE does not send a live order in this scenario.</p> : null}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className={`num mt-1 ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
