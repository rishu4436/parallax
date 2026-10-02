"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DEMO_SCENARIOS,
  agenticAvailability,
  formatPx,
  limitsFromSettings,
  replayComplete,
  replayScenario,
  replayScript,
  shortAddr,
  studioDeskStatus,
  visibleFrames,
  type DemoScenarioId,
} from "@parallax/core";
import { useParallax } from "@/lib/store";

const PACE_MS = 600;

export function ReplayWorkspace() {
  const settings = useParallax((s) => s.settings);
  const session = useParallax((s) => s.session);
  const studio = useParallax((s) => s.studio);
  const beat = useParallax((s) => s.beat);
  const [id, setId] = useState<DemoScenarioId>("gap-closed");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  const limits = limitsFromSettings(settings, 10);
  const scenario = replayScenario(id);
  const script = useMemo(() => replayScript(scenario, limits), [scenario, limits]);
  const frames = visibleFrames(script, step);
  const done = replayComplete(script, step);
  const wallet = agenticAvailability(agentStatus);
  const studioStatus = studioDeskStatus({ deskKnown: session != null || beat != null, live: studio.live });

  useEffect(() => {
    let cancel = false;
    void fetch("/api/agentic")
      .then((res) => res.json())
      .then((body: { status?: string; address?: string | null }) => {
        if (cancel) return;
        setAgentStatus(body.status || "UNCONNECTED");
        setAgentAddress(body.address || null);
      })
      .catch(() => {
        if (!cancel) setAgentStatus("UNCONNECTED");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (done) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), PACE_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step, done]);

  function choose(next: DemoScenarioId) {
    setPlaying(false);
    setId(next);
    setStep(0);
  }

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Replay</p>
        <h1 className="display mt-3 text-4xl">Guided Replay</h1>
        <p className="mt-3 max-w-2xl text-sm text-dim">Replay deterministic Parallax execution paths without placing a live order.</p>
        <p className="mt-3 text-[11px] tracking-[0.16em] text-dim">REPLAY · DETERMINISTIC SCENARIO · NO LIVE TRANSACTION</p>
      </header>

      <section className="mt-6" aria-labelledby="scenario-list">
        <h2 id="scenario-list" className="kicker">Scenario</h2>
        <ul className="mt-3 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_SCENARIOS.map((row) => (
            <li key={row.id} className="bg-bg">
              <button type="button" className="min-h-11 w-full px-3 py-3 text-left" aria-pressed={row.id === id} onClick={() => choose(row.id)}>
                <span className={row.id === id ? "text-gold" : "text-ink"}>{row.label}</span>
                <span className="mt-1 block text-[11px] text-dim">{row.card.ticker} · {row.card.symbol} · {row.cashOpen ? "cash open" : "cash closed"}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.8fr)]">
        <section aria-labelledby="replay-view">
          <h2 id="replay-view" className="kicker">{scenario.card.ticker}</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-dim">Reference</dt>
              <dd className="num mt-1">{formatPx(scenario.card.reference)}</dd>
            </div>
            <div>
              <dt className="text-dim">Tokenized rail</dt>
              <dd className="num mt-1">{formatPx(scenario.card.perShare)}</dd>
            </div>
            <div>
              <dt className="text-dim">Gap</dt>
              <dd className="num mt-1">{scenario.card.grossPct == null ? "—" : `${scenario.card.grossPct}%`}</dd>
            </div>
            <div>
              <dt className="text-dim">Rail</dt>
              <dd className="mt-1">{scenario.card.symbol} · {scenario.card.rail}</dd>
            </div>
            <div>
              <dt className="text-dim">Liquidity</dt>
              <dd className="num mt-1">{scenario.card.liquidity == null ? "—" : scenario.card.liquidity.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt className="text-dim">Policy</dt>
              <dd className="mt-1">{frames.some((frame) => frame.beat === "policy") ? (script.policyPass ? "ALLOW" : "BLOCKED") : "—"}</dd>
            </div>
          </dl>
          {scenario.wrappers.length > 1 ? (
            <ul className="mt-4 text-sm">
              {scenario.wrappers.map((row) => (
                <li key={row.symbol} className="border-t border-line py-2">
                  {row.rail} · {row.symbol} · {formatPx(row.perShare)} · gap {row.grossPct}%
                </li>
              ))}
            </ul>
          ) : null}
          <h3 className="kicker mt-6">Execution path</h3>
          <ol className="mt-3">
            {script.frames.map((frame) => {
              const visible = frames.some((row) => row.beat === frame.beat);
              return (
                <li key={frame.beat} className="flex min-h-11 items-baseline justify-between gap-3 border-t border-line py-2 text-sm">
                  <span>{frame.title}</span>
                  <span className="text-dim">{visible ? frame.state.toUpperCase() : "—"}</span>
                </li>
              );
            })}
          </ol>
          {done ? <p className="mt-4 text-sm">{script.boundary}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => { setPlaying(false); setStep(0); }}>Reset</button>
            <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => setPlaying(true)}>Play</button>
            <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => { setPlaying(false); setStep((value) => value + 1); }}>Step</button>
            <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => { setStep(0); setPlaying(true); }}>Replay</button>
            <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.14em]" onClick={() => setPlaying(false)}>Pause</button>
          </div>
          <p className="mt-4 text-[11px] text-dim">Policy floor {limits.minNetEdgePct}% net · liquidity {limits.minLiquidityUsd.toLocaleString("en-US")} · slip {limits.maxSlipPct}% · order cap {limits.maxTradeUsdt} USDT · kill switch {settings?.killSwitch ? "ON" : "OFF"}</p>
        </section>

        <aside aria-labelledby="trace">
          <h2 id="trace" className="kicker">Decision trace</h2>
          <ol className="mt-3 space-y-4 text-sm">
            {frames.map((frame) => (
              <li key={frame.beat}>
                <p>{frame.title}</p>
                <p className="text-dim">{frame.detail}</p>
                <p className="text-[11px] text-dim">Source: DEMO_SCENARIOS / {frame.beat === "policy" ? "evaluateLimits" : "scenario card"}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 border-t border-line pt-4 text-sm">
            <p>Agentic Wallet {wallet === "CONNECTED" ? "CONNECTED" : wallet === "DISCONNECTED" ? "NOT CONNECTED" : "UNKNOWN"}{wallet === "CONNECTED" && agentAddress ? ` · ${shortAddr(agentAddress)}` : ""}</p>
            <p className="mt-2">Agent Studio {studioStatus}</p>
            <p className="mt-2 text-dim">Replay does not hand a live order to either system.</p>
          </div>
          <div className="mt-4 flex flex-col items-start gap-1">
            <Link href={`/markets/${scenario.card.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">Open market</Link>
            <Link href={`/opportunities?ticker=${scenario.card.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View opportunity</Link>
            <Link href="/strategies" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View strategies</Link>
            <Link href="/agents" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View agents</Link>
            <Link href="/activity" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">Real activity</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
