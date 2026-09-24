"use client";

import { formatPct, formatPx, jobFromStrategy, STRATEGY_CATALOG, strategyById, type AgentFill, type AgentStrategyType, type ArmedStrategy, type StrategyId } from "@parallax/core";
import { useEffect, useRef, useState } from "react";
import { useParallax } from "@/lib/store";

type StrategyPick = StrategyId | AgentStrategyType;

const OPTIONS: Array<{ id: StrategyPick; label: string }> = [
  ...STRATEGY_CATALOG.map((card) => ({ id: card.id, label: card.name })),
  { id: "BASIS_TRADE", label: "Basis Trade" },
  { id: "CROSS_ARB", label: "Cross-Protocol Arb" },
  { id: "CORRELATION", label: "Correlation Rebalance" },
];

function isAgentType(id: StrategyPick): id is AgentStrategyType {
  return id === "BASIS_TRADE" || id === "CROSS_ARB" || id === "CORRELATION";
}

export function AgentExecutionLog({ initial }: { initial: AgentFill[] }) {
  const [rows, setRows] = useState(initial);
  const live = useRef(false);
  useEffect(() => {
    if (!live.current) setRows(initial);
  }, [initial]);
  useEffect(() => {
    const source = new EventSource("/api/agent-log");
    source.onmessage = (event) => {
      live.current = true;
      try {
        const body = JSON.parse(event.data) as { fills?: AgentFill[] };
        if (Array.isArray(body.fills)) setRows(body.fills);
      } catch {
        // Ignore a partial frame.
      }
    };
    return () => source.close();
  }, []);

  return (
    <section>
      <h2 className="kicker">Agent log</h2>
      {rows.length ? (
        <ul className="mt-3 space-y-2">
          {rows.slice(0, 8).map((row) => (
            <li key={row.id} className="border border-gold/50 px-3 py-3">
              <p className="text-sm text-gold">
                {row.side} {row.usdt} USDT {row.ticker}
                {row.spreadPct != null ? ` · ${formatPct(row.spreadPct)}` : ""}
              </p>
              <p className="mt-1 text-xs text-dim">
                {row.note}
                {row.gasUsd != null ? ` · gas ${formatPx(row.gasUsd)}` : ""}
                {` · x402 ${row.x402}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-dim">The agent has not broadcast a swap yet. Arm a strategy and the worker sends it from this machine.</p>
      )}
    </section>
  );
}

export function StrategyArm() {
  const ticker = useParallax((s) => s.ticker);
  const usdtDesk = useParallax((s) => s.usdt);
  const armed = useParallax((s) => s.armed);
  const jobs = useParallax((s) => s.jobs);
  const pauseJob = useParallax((s) => s.pauseJob);
  const saveJob = useParallax((s) => s.saveJob);
  const settings = useParallax((s) => s.settings);
  const workerEnabled = useParallax((s) => s.workerEnabled);
  const beat = useParallax((s) => s.beat);
  const refreshDesk = useParallax((s) => s.refreshDesk);
  const [type, setType] = useState<StrategyPick>("dca");
  const [pair, setPair] = useState(ticker);
  const [spread, setSpread] = useState("1");
  const [ratio, setRatio] = useState("0.5");
  const [drift, setDrift] = useState("1.5");
  const [usdt, setUsdt] = useState(usdtDesk || "10");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPair(ticker);
  }, [ticker]);

  async function arm() {
    if (!isAgentType(type)) {
      const size = Number(usdt);
      if (settings && (!Number.isFinite(size) || size <= 0 || size > settings.orderCapUsdt)) {
        setNote(settings ? `Order cap is ${settings.orderCapUsdt} USDT.` : "Size must be greater than zero.");
        return;
      }
      const job = jobFromStrategy(type, { ticker: pair.split(/[,\s]+/).find(Boolean) || ticker, usdt });
      if (!job) {
        setNote("That card explains the session. It does not arm a job.");
        return;
      }
      await saveJob(job);
      setNote(`Armed ${job.name}.`);
      await refreshDesk();
      return;
    }
    const res = await fetch("/api/arm-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "arm",
        type,
        assetPairs: pair.split(/[,\s]+/).filter(Boolean),
        targetSpread: spread,
        targetPortfolioRatio: ratio,
        volatilityDriftThreshold: drift,
        usdt,
      }),
    });
    const body = (await res.json()) as { ok?: boolean; message?: string };
    setNote(body.ok ? "Armed. The worker polls this strategy." : body.message || "Could not arm.");
    await refreshDesk();
  }

  async function toggleWorker() {
    await fetch("/api/arm-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "worker", enabled: !workerEnabled }),
    });
    await refreshDesk();
  }

  async function pause(row: ArmedStrategy) {
    await fetch("/api/arm-job", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pause", id: row.id, paused: !row.paused }),
    });
    await refreshDesk();
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="grid gap-1 text-xs text-dim">
        Strategy
        <select value={type} onChange={(event) => setType(event.target.value as StrategyPick)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm">
          {OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {strategyById(type) ? <p className="text-xs text-dim">{strategyById(type)?.when}</p> : null}
      <label className="grid gap-1 text-xs text-dim">
        Ticker
        <input value={pair} onChange={(event) => setPair(event.target.value)} className="h-9 rounded-md border border-line bg-bg px-2 text-sm" />
      </label>
      {type === "CORRELATION" ? (
        <>
          <label className="grid gap-1 text-xs text-dim">
            Target portfolio ratio
            <input value={ratio} onChange={(event) => setRatio(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs text-dim">
            Volatility drift threshold
            <input value={drift} onChange={(event) => setDrift(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
          </label>
        </>
      ) : type === "BASIS_TRADE" || type === "CROSS_ARB" ? (
        <label className="grid gap-1 text-xs text-dim">
          Target spread %
          <input value={spread} onChange={(event) => setSpread(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
        </label>
      ) : null}
      <label className="grid gap-1 text-xs text-dim">
        Size USDT
        <input value={usdt} onChange={(event) => setUsdt(event.target.value)} className="num h-9 rounded-md border border-line bg-bg px-2 text-sm" />
      </label>
      {type === "session_hours" ? null : (
        <button className="mt-3 h-9 w-full bg-gold text-[11px] tracking-[0.16em] text-bg" onClick={() => void arm()}>
          ARM
        </button>
      )}
      <button className="text-[11px] tracking-[0.16em] text-gold" onClick={() => void toggleWorker()}>
        Desk worker {workerEnabled && beat?.status === "live" ? "on" : workerEnabled ? "armed" : "off"}
      </button>
      {note ? <p className="text-xs text-dim">{note}</p> : null}
      {jobs.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {jobs.map((job) => (
            <li key={job.id}>
              <p>{job.name}</p>
              <p className="text-xs text-dim">
                {job.paused ? "paused" : "armed"} · {job.lastAction || job.cadence}
              </p>
              <button className="text-xs text-gold" onClick={() => void pauseJob(job.id, !job.paused)}>
                {job.paused ? "Resume" : "Pause"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {armed.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {armed.map((row) => (
            <li key={row.id}>
              <p>
                {row.name} · {row.assetPairs.join(" ")}
              </p>
              <p className="text-xs text-dim">
                {row.paused ? "paused" : "armed"} · {row.lastAction || `${row.targetSpread}%`}
              </p>
              <button className="text-xs text-gold" onClick={() => void pause(row)}>
                {row.paused ? "Resume" : "Pause"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
