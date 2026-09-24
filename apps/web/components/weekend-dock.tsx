"use client";

import { formatPct, formatPx, gapPct, presetCron, shortYmd, type Job } from "@parallax/core";
import { useParallax } from "@/lib/store";

export function WeekendDock() {
  const session = useParallax((s) => s.session);
  const brief = useParallax((s) => s.brief);
  const books = useParallax((s) => s.books);
  const portfolio = useParallax((s) => s.portfolio);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayDate = useParallax((s) => s.fridayDate);
  const priorClose = useParallax((s) => s.priorClose);
  const priorOpen = useParallax((s) => s.priorOpen);
  const priorDate = useParallax((s) => s.priorDate);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const ticker = useParallax((s) => s.ticker);
  const livePrint = useParallax((s) => s.livePrint);
  const liveSymbol = useParallax((s) => s.liveSymbol);
  const stockReference = useParallax((s) => s.stockReference);
  const saveJob = useParallax((s) => s.saveJob);
  const open = books.filter((book) => book.status === "OPEN").length;
  const held = (portfolio?.lines ?? []).filter((line) => line.rail && line.amount > 0);
  const tradable = held.filter((line) => books.some((book) => book.wrapper.symbol === line.symbol && book.status === "OPEN")).length;
  const refClose = priorClose ?? fridayClose ?? stockReference;
  const gaps = books
    .map((book) => (book.best?.ok && refClose ? gapPct(book.best.perShare, refClose) : null))
    .filter((n): n is number => n != null);
  const median = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
  const bestPx = books.find((book) => book.best?.ok)?.best?.perShare;
  const vsOpen = bestPx && priorOpen ? gapPct(bestPx, priorOpen) : null;
  const vsSession = bestPx && sessionOpen ? gapPct(bestPx, sessionOpen) : null;
  const vsFriday = bestPx && fridayClose && fridayDate !== priorDate ? gapPct(bestPx, fridayClose) : null;
  const clock = !session
    ? "Cash"
    : session.atmosphere === "open"
      ? "Cash live · gap compressed"
      : `Cash dark ${Math.floor(Math.max(0, session.countdownMs) / 3_600_000)}:${String(Math.floor(Math.max(0, session.countdownMs) / 60_000) % 60).padStart(2, "0")}`;
  const closeLabel = priorDate ? `prior close ${shortYmd(priorDate)}` : fridayClose ? "Friday cash close" : "TradFi reference";
  const liveGap = livePrint && refClose ? gapPct(livePrint, refClose) : null;

  return (
    <section id="weekend" className="fog-target flex-1 border-t border-line pt-5">
      <h2 className="kicker">Weekend / gap</h2>
      <p className="display mt-3 text-3xl leading-tight">{clock}</p>
      <p className="mt-2 text-sm text-dim">
        {held.length ? `${tradable} of ${held.length} holdings tradable` : `${open} of ${books.length || 3} rails open`}
      </p>
      <p className="num mt-1 text-sm">
        {median != null
          ? `Median ${formatPct(median)} vs ${closeLabel}${refClose ? ` ${formatPx(refClose)}` : ""}`
          : refClose
            ? `${closeLabel} ${formatPx(refClose)}${livePrint ? ` · Live BSC${liveSymbol ? ` ${liveSymbol}` : ""} ${formatPx(livePrint)}` : ""}${liveGap != null ? ` · ${formatPct(liveGap)}` : ""}`
            : "Prior cash close unavailable"}
      </p>
      <p className="num mt-1 text-xs text-dim">
        {[
          vsOpen != null && priorOpen && priorDate ? `${formatPct(vsOpen)} vs prior open ${shortYmd(priorDate)} ${formatPx(priorOpen)}` : null,
          vsSession != null && sessionOpen && sessionOpenDate ? `${formatPct(vsSession)} vs session open ${shortYmd(sessionOpenDate)} ${formatPx(sessionOpen)}` : null,
          vsFriday != null && fridayClose ? `${formatPct(vsFriday)} vs Friday ${formatPx(fridayClose)}` : null,
        ]
          .filter(Boolean)
          .join("  ·  ")}
      </p>
      <div className="mt-3 space-y-2 text-sm text-dim">
        {(brief.length ? brief : ["Cash hours and on-chain hours are different clocks.", "A closed rail stays blank.", "Queue only fires when a rail is actually open."]).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <button
        className="mt-5 w-full border border-gold px-3 py-3 text-left text-xs tracking-[0.08em] text-gold transition-colors duration-150 hover:bg-gold/10"
        onClick={() => {
          const preset = presetCron("weekday-open");
          const job: Job = {
            id: crypto.randomUUID(),
            name: `Queue $15 ${ticker}`,
            type: "weekend_cap",
            paused: false,
            cadence: "next cash open",
            cron: preset.cron,
            createdAt: Date.now(),
            spec: { maxUsdt: "15", gapPct: 1, mode: "queue_for_cash_open", ticker },
          };
          void saveJob(job);
        }}
      >
        Queue $15 on best OPEN rail if Friday gap &gt; 1% at next cash open
      </button>
    </section>
  );
}
