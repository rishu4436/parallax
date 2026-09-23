"use client";

import { useState } from "react";
import { BASKETS, parsePlainRule, presetCron, splitBasket, type Basket, type Job } from "@parallax/core";
import { useParallax } from "@/lib/store";

const FIRST = ["NVDA", "AAPL", "QQQ"] as const;
const EXAMPLES = [
  "buy 10 NVDA every weekday at the open",
  "buy 8 NVDA when it is 1.5% below yesterday",
  "buy the cheaper NVDA rail every 15 minutes",
  "buy 20 of the AI chips basket every hour",
  "flatten AAPL before the print at 2026-10-20 16:30",
];

export function BuildPanel() {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-6 md:px-8">
      <FirstBuy />
      <Baskets />
      <PlainRule />
    </div>
  );
}

function FirstBuy() {
  const setUsdt = useParallax((s) => s.setUsdt);
  const selectTicker = useParallax((s) => s.selectTicker);
  const setView = useParallax((s) => s.setView);
  const [ticker, setTicker] = useState<(typeof FIRST)[number]>("NVDA");
  const [usdt, setSize] = useState("10");

  return (
    <section>
      <h2 className="kicker">First buy</h2>
      <p className="mt-2 max-w-xl text-sm text-dim">
        You are buying a token on BNB Chain, not a share. No vote. Dividends rebase into the token. Pick one name, set a size, then sign on Trade.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {FIRST.map((name) => (
          <button
            key={name}
            className={`border px-3 py-2 text-sm ${ticker === name ? "border-gold text-ink" : "border-line text-dim"}`}
            onClick={() => setTicker(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <label className="mt-3 grid max-w-xs gap-1 text-xs text-dim">
        Size USDT
        <input value={usdt} inputMode="decimal" onChange={(event) => setSize(event.target.value)} className="num h-10 border border-line bg-transparent px-3 text-sm text-ink" />
      </label>
      <button
        className="mt-3 h-10 bg-gold px-4 text-[11px] tracking-[0.16em] text-bg"
        onClick={() => {
          setUsdt(usdt);
          void selectTicker(ticker);
          setView("trade");
        }}
      >
        Continue to {ticker}
      </button>
    </section>
  );
}

function Baskets() {
  const saveJob = useParallax((s) => s.saveJob);
  const setUsdt = useParallax((s) => s.setUsdt);
  const selectTicker = useParallax((s) => s.selectTicker);
  const setView = useParallax((s) => s.setView);
  const [total, setTotal] = useState("40");

  return (
    <section>
      <h2 className="kicker">Baskets</h2>
      <p className="mt-2 max-w-xl text-sm text-dim">Equal slices of the names in this book. Arm sends the worker. Buy jumps you to Trade for that one name.</p>
      <label className="mt-3 grid max-w-xs gap-1 text-xs text-dim">
        Total USDT
        <input value={total} inputMode="decimal" onChange={(event) => setTotal(event.target.value)} className="num h-10 border border-line bg-transparent px-3 text-sm text-ink" />
      </label>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {BASKETS.map((basket) => (
          <BasketCard
            key={basket.id}
            basket={basket}
            total={total}
            onArm={(job) => void saveJob(job)}
            onBuy={(ticker, usdt) => {
              setUsdt(usdt);
              void selectTicker(ticker);
              setView("trade");
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function BasketCard({
  basket,
  total,
  onArm,
  onBuy,
}: {
  basket: Basket;
  total: string;
  onArm: (job: Job) => void;
  onBuy: (ticker: string, usdt: string) => void;
}) {
  const slices = splitBasket(total, basket.tickers);
  return (
    <li className="border border-line px-3 py-3">
      <p className="text-sm">{basket.name}</p>
      <p className="mt-1 text-xs text-dim">{basket.blurb}</p>
      <p className="num mt-2 text-xs text-dim">{slices.map((slice) => `${slice.ticker} ${slice.usdt}`).join(" · ")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="h-9 bg-gold px-3 text-[11px] tracking-[0.14em] text-bg"
          onClick={() => {
            const preset = presetCron("weekday-open");
            const each = slices[0]?.usdt || "10";
            onArm({
              id: crypto.randomUUID(),
              name: `${basket.name} basket`,
              type: "dca",
              paused: false,
              cadence: preset.cadence,
              cron: preset.cron,
              createdAt: Date.now(),
              spec: { tickers: basket.tickers, usdtEach: each, cron: preset.cron, rail: "best", maxPremiumPct: 2 },
            });
          }}
        >
          Arm agent
        </button>
        {slices.map((slice) => (
          <button key={slice.ticker} className="h-9 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => onBuy(slice.ticker, slice.usdt)}>
            Buy {slice.ticker}
          </button>
        ))}
      </div>
    </li>
  );
}

function PlainRule() {
  const saveJob = useParallax((s) => s.saveJob);
  const [text, setText] = useState(EXAMPLES[0]);
  const [note, setNote] = useState("");
  const parsed = parsePlainRule(text);

  return (
    <section>
      <h2 className="kicker">Write a rule</h2>
      <p className="mt-2 max-w-xl text-sm text-dim">Say what to buy. The desk turns it into a job. The worker queues each clip. You still sign.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} className="border border-line px-2 py-1 text-left text-[11px] text-dim hover:border-gold" onClick={() => setText(example)}>
            {example}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        className="mt-3 w-full border border-line bg-transparent px-3 py-2 text-sm"
      />
      <p className={`mt-2 text-sm ${parsed.ok ? "text-ink" : "text-down"}`}>{parsed.ok ? parsed.summary : parsed.message}</p>
      {note ? <p className="mt-1 text-xs text-gold">{note}</p> : null}
      <button
        className="mt-3 h-10 bg-gold px-4 text-[11px] tracking-[0.16em] text-bg disabled:opacity-40"
        disabled={!parsed.ok}
        onClick={() => {
          if (!parsed.ok) return;
          void saveJob({ ...parsed.job, id: crypto.randomUUID() });
          setNote(`Armed ${parsed.job.name}.`);
        }}
      >
        Arm this rule
      </button>
    </section>
  );
}
