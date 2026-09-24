"use client";

import { useMemo, useState } from "react";
import {
  STRATEGY_CATALOG,
  adviseDesk,
  cashSession,
  deskSignals,
  jobFromStrategy,
  presetCron,
  shortAddr,
  strategyById,
  type Job,
  type QueueMode,
  type Rail,
  type StrategyId,
} from "@parallax/core";
import { useParallax } from "@/lib/store";

const FORM_TYPES: Array<{ id: StrategyId; label: string }> = [
  { id: "dca", label: "Session DCA" },
  { id: "index_core", label: "Index core" },
  { id: "cheap_rail", label: "Cheap rail" },
  { id: "weekend_cap", label: "Weekend discovery" },
  { id: "gap_fade", label: "Prior-close discount" },
  { id: "open_print", label: "Cash-open window" },
  { id: "flatten_earnings", label: "Flatten earnings" },
];

export function StrategiesDock() {
  const beat = useParallax((s) => s.beat);
  const studio = useParallax((s) => s.studio);
  const jobs = useParallax((s) => s.jobs);
  const pauseJob = useParallax((s) => s.pauseJob);
  const saveJob = useParallax((s) => s.saveJob);
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayOpen = useParallax((s) => s.fridayOpen);
  const fridayDate = useParallax((s) => s.fridayDate);
  const priorClose = useParallax((s) => s.priorClose);
  const priorOpen = useParallax((s) => s.priorOpen);
  const priorDate = useParallax((s) => s.priorDate);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const usdt = useParallax((s) => s.usdt);
  const [picked, setPicked] = useState<StrategyId | null>(null);

  const advice = useMemo(() => {
    if (!books.length) return [];
    return adviseDesk(
      deskSignals({
        ticker,
        session: cashSession(),
        books,
        fridayClose,
        fridayOpen,
        fridayDate,
        priorClose,
        priorOpen,
        priorDate,
        sessionOpen,
        sessionOpenDate,
      }),
      jobs,
    );
  }, [books, fridayClose, fridayDate, fridayOpen, jobs, priorClose, priorDate, priorOpen, sessionOpen, sessionOpenDate, ticker]);

  return (
    <section id="strategies" className="mx-auto w-full max-w-5xl px-6 py-6 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="kicker">Jobs</h2>
          <p className="mt-2 max-w-xl text-sm text-dim">Pick a strategy for {ticker}. Armed jobs stay inside the order and daily caps. The worker sends them from this machine.</p>
        </div>
        <p className="text-xs text-dim">
          Worker {beat?.status === "live" ? "running" : "stopped"}
          {studio.live ? " · Studio live" : ""}
          {studio.address ? ` · ${shortAddr(studio.address)}` : ""}
        </p>
      </div>
      {jobs.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-3 border border-line px-3 py-3 text-sm">
              <span>
                <span className="block">{job.name}</span>
                <span className="text-xs text-dim">
                  {job.paused ? "paused" : "armed"} · {job.lastAction || job.cadence}
                </span>
              </span>
              <button className="text-xs text-gold" onClick={() => void pauseJob(job.id, !job.paused)}>
                {job.paused ? "Resume" : "Pause"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <ul className="mt-6 grid gap-2 md:grid-cols-2">
        {STRATEGY_CATALOG.map((card) => {
          const row = advice.find((item) => item.id === card.id);
          const selected = picked === card.id;
          return (
            <li key={card.id}>
              <button
                type="button"
                className={`w-full border px-3 py-2 text-left transition-colors duration-150 ${selected ? "border-gold" : "border-line hover:border-goldDim"}`}
                onClick={() => setPicked(selected ? null : card.id)}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">{card.name}</span>
                  <span className="text-[10px] tracking-[0.16em] text-dim">{card.kicker}</span>
                </span>
                <span className="mt-1 block text-xs text-dim">{card.when}</span>
                {row ? (
                  <span className={`mt-1 block text-xs ${row.status === "fire" ? "text-gold" : "text-dim"}`}>
                    {statusLabel(row.status)} · {row.headline}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-dim">Eight desk strategies, plus Basis Trade, Cross-Protocol Arb, and Correlation Rebalance on Trade.</p>
      {picked && picked !== "session_hours" ? (
        <JobForm
          key={picked}
          initial={picked}
          ticker={ticker}
          usdt={usdt}
          onCreate={(job) => {
            void saveJob(job);
            setPicked(null);
          }}
        />
      ) : null}
      {picked === "session_hours" ? (
        <p className="mt-3 text-xs text-dim">{strategyById("session_hours")?.thesis}</p>
      ) : null}
    </section>
  );
}

function statusLabel(status: string): string {
  if (status === "fire") return "Ready now";
  if (status === "wait") return "Waiting";
  if (status === "skip") return "Not this clock";
  return "Note";
}

function startingCadence(id: StrategyId): string {
  if (id === "index_core" || id === "open_print" || id === "weekend_cap") return "weekday-open";
  if (id === "cheap_rail" || id === "gap_fade") return "15m";
  return "1h";
}

function JobForm({
  initial,
  ticker: deskTicker,
  usdt: deskUsdt,
  onCreate,
}: {
  initial: StrategyId;
  ticker: string;
  usdt: string;
  onCreate: (job: Job) => void;
}) {
  const [id, setId] = useState<StrategyId>(initial);
  const [ticker, setTicker] = useState(initial === "index_core" ? "QQQ, SPY" : deskTicker);
  const [usdt, setUsdt] = useState(deskUsdt || "10");
  const [cadence, setCadence] = useState(startingCadence(initial));
  const [rail, setRail] = useState<"best" | Rail>("best");
  const [cut, setCut] = useState("25");
  const [dip, setDip] = useState("3");
  const [printAt, setPrintAt] = useState("");
  const [flatten, setFlatten] = useState(true);
  const [gap, setGap] = useState("1");
  const [discount, setDiscount] = useState("1");
  const [minBps, setMinBps] = useState("40");
  const [windowMin, setWindowMin] = useState("30");
  const [premium, setPremium] = useState("2");
  const [mode, setMode] = useState<QueueMode>("queue_for_cash_open");
  const card = strategyById(id) ?? STRATEGY_CATALOG[0];

  return (
    <form
      className="mt-3 grid gap-2 rounded-md border border-line p-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (id === "index_core") {
          const job = jobFromStrategy("index_core", { ticker, usdt, cadence: cadence || "weekday-open" });
          if (job) onCreate(job);
          return;
        }
        const preset = presetCron(cadence);
        const jobId = crypto.randomUUID();
        if (id === "dca") {
          onCreate({
            id: jobId,
            name: `DCA ${ticker}`,
            type: "dca",
            paused: false,
            cadence: preset.cadence,
            cron: preset.cron,
            createdAt: Date.now(),
            spec: {
              tickers: ticker.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean),
              usdtEach: usdt,
              cron: preset.cron,
              rail,
              maxPremiumPct: Number(premium) || undefined,
            },
          });
          return;
        }
        if (id === "cheap_rail") {
          onCreate({
            id: jobId,
            name: `Cheap rail ${ticker}`,
            type: "cheap_rail",
            paused: false,
            cadence: preset.cadence,
            cron: preset.cron,
            createdAt: Date.now(),
            spec: {
              tickers: ticker.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean),
              usdtEach: usdt,
              minBps: Number(minBps) || 40,
              maxSlipBps: 80,
            },
          });
          return;
        }
        if (id === "flatten_earnings") {
          onCreate({
            id: jobId,
            name: `Flatten ${ticker}`,
            type: "flatten_earnings",
            paused: false,
            cadence: "around the print",
            cron: preset.cron,
            createdAt: Date.now(),
            spec: {
              ticker: ticker.toUpperCase(),
              cutPctBeforePrint: Number(cut),
              dipPct: Number(dip),
              usdtAdd: usdt,
              flattenAfterHours: flatten,
              printAt: printAt || undefined,
            },
          });
          return;
        }
        if (id === "gap_fade") {
          onCreate({
            id: jobId,
            name: `Discount ${ticker}`,
            type: "gap_fade",
            paused: false,
            cadence: mode,
            cron: preset.cron,
            createdAt: Date.now(),
            spec: { ticker: ticker.toUpperCase(), usdtEach: usdt, discountPct: Number(discount), mode, maxSlipBps: 80 },
          });
          return;
        }
        if (id === "open_print") {
          const openPreset = presetCron("weekday-open");
          onCreate({
            id: jobId,
            name: `Open print ${ticker}`,
            type: "open_print",
            paused: false,
            cadence: openPreset.cadence,
            cron: openPreset.cron,
            createdAt: Date.now(),
            spec: {
              ticker: ticker.toUpperCase(),
              usdtEach: usdt,
              minGapPct: Number(gap) || 0.5,
              windowMin: Number(windowMin) || 30,
              maxSlipBps: 80,
            },
          });
          return;
        }
        onCreate({
          id: jobId,
          name: `Weekend ${ticker}`,
          type: "weekend_cap",
          paused: false,
          cadence: mode,
          cron: preset.cron,
          createdAt: Date.now(),
          spec: { ticker: ticker.toUpperCase(), maxUsdt: usdt, gapPct: Number(gap), mode },
        });
      }}
    >
      <label className="grid gap-1 text-xs text-dim">
        Type
        <select
          value={id}
          onChange={(event) => {
            const next = event.target.value as StrategyId;
            setId(next);
            const nextCard = strategyById(next);
            if (next === "index_core" || next === "open_print" || next === "weekend_cap") setCadence("weekday-open");
            else if (next === "cheap_rail" || next === "gap_fade") setCadence("15m");
            else setCadence("1h");
            if (nextCard) setTicker(next === "index_core" ? "QQQ, SPY" : deskTicker);
          }}
          className="h-9 rounded-md border border-line bg-bg px-2 text-sm"
        >
          {FORM_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-dim">{card.thesis}</p>
      <label className="grid gap-1 text-xs text-dim">
        Ticker
        <input value={ticker} onChange={(event) => setTicker(event.target.value)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm" />
      </label>
      <label className="grid gap-1 text-xs text-dim">
        USDT notional
        <input value={usdt} onChange={(event) => setUsdt(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
      </label>
      {id === "dca" || id === "index_core" || id === "cheap_rail" ? (
        <label className="grid gap-1 text-xs text-dim">
          Cadence
          <select value={cadence} onChange={(event) => setCadence(event.target.value)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm">
            <option value="15m">Every 15 minutes</option>
            <option value="1h">Hourly</option>
            <option value="4h">Every 4 hours</option>
            <option value="weekday-open">Weekdays 09:30 ET</option>
          </select>
        </label>
      ) : null}
      {id === "dca" ? (
        <>
          <label className="grid gap-1 text-xs text-dim">
            Rail
            <select value={rail} onChange={(event) => setRail(event.target.value as "best" | Rail)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm">
              <option value="best">Best open rail</option>
              <option value="bStock">bStocks</option>
              <option value="ondo">Ondo</option>
              <option value="xStock">xStocks</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Skip if premium vs Friday %
            <input value={premium} onChange={(event) => setPremium(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
        </>
      ) : null}
      {id === "cheap_rail" ? (
        <label className="grid gap-1 text-xs text-dim">
          Min spread bps
          <input value={minBps} onChange={(event) => setMinBps(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
        </label>
      ) : null}
      {id === "flatten_earnings" ? (
        <>
          <label className="grid gap-1 text-xs text-dim">
            Cut % before print
            <input value={cut} onChange={(event) => setCut(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Dip % to add
            <input value={dip} onChange={(event) => setDip(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Print time
            <input type="datetime-local" value={printAt} onChange={(event) => setPrintAt(event.target.value)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs text-dim">
            <input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} />
            Flatten after hours
          </label>
        </>
      ) : null}
      {id === "weekend_cap" || id === "gap_fade" ? (
        <>
          <label className="grid gap-1 text-xs text-dim">
            {id === "gap_fade" ? "Discount % vs prior close" : "Gap % vs Friday"}
            <input
              value={id === "gap_fade" ? discount : gap}
              onChange={(event) => (id === "gap_fade" ? setDiscount(event.target.value) : setGap(event.target.value))}
              className="num h-9 rounded-md border border-line bg-bg px-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as QueueMode)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm">
              <option value="queue_for_cash_open">Queue for cash open</option>
              <option value="trade_if_open">Trade if a rail is open</option>
            </select>
          </label>
        </>
      ) : null}
      {id === "open_print" ? (
        <>
          <label className="grid gap-1 text-xs text-dim">
            Discount % at open
            <input value={gap} onChange={(event) => setGap(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Window minutes after 09:30 ET
            <input value={windowMin} onChange={(event) => setWindowMin(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
        </>
      ) : null}
      <button className="h-9 rounded-md bg-gold text-sm font-semibold text-bg">Save job</button>
    </form>
  );
}
