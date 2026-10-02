"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AGENT_STRATEGY_NAMES,
  COPY,
  STRATEGY_CATALOG,
  adviseDesk,
  agenticAvailability,
  cashSession,
  deskSignals,
  marketHref,
  opportunityHref,
  previewJob,
  shortAddr,
  strategyPresence,
  strategyRule,
  studioDeskStatus,
  type Advice,
  type AgentStrategyType,
  type DeskSignals,
  type StrategyId,
} from "@parallax/core";
import { StrategyArm, type StrategyPick } from "@/components/agent-panel";
import { StatusChip } from "@/components/ui/status";
import { useParallax } from "@/lib/store";

function num(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(2);
}

export function StrategiesWorkspace() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const jobs = useParallax((s) => s.jobs);
  const fills = useParallax((s) => s.fills);
  const settings = useParallax((s) => s.settings);
  const session = useParallax((s) => s.session);
  const beat = useParallax((s) => s.beat);
  const studio = useParallax((s) => s.studio);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayOpen = useParallax((s) => s.fridayOpen);
  const fridayDate = useParallax((s) => s.fridayDate);
  const priorClose = useParallax((s) => s.priorClose);
  const priorOpen = useParallax((s) => s.priorOpen);
  const priorDate = useParallax((s) => s.priorDate);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const [picked, setPicked] = useState<StrategyId>("dca");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

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

  const signals = useMemo<DeskSignals | null>(() => {
    if (!books.length) return null;
    return deskSignals({
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
    });
  }, [books, fridayClose, fridayDate, fridayOpen, priorClose, priorDate, priorOpen, sessionOpen, sessionOpenDate, ticker]);

  const advice = useMemo(() => (signals ? adviseDesk(signals, jobs) : []), [signals, jobs]);
  const card = STRATEGY_CATALOG.find((item) => item.id === picked) || STRATEGY_CATALOG[0];
  const decision = advice.find((item) => item.id === card.id);
  const preview = previewJob(card.id, ticker);
  const rule = strategyRule(preview);
  const wallet = agenticAvailability(agentStatus);
  const studioStatus = studioDeskStatus({ deskKnown: session != null || beat != null, live: studio.live });

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Strategies</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Policy-bound strategies for tokenized equity markets.</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">A strategy emits an intent. It does not sign. {COPY.disclaimer}</p>
        <ol className="mt-4 grid gap-2 text-[11px] tracking-[0.08em] text-dim md:grid-cols-4">
          {["Strategy", "Intent", "Quote", "Passport", "Policy", "Commitment", "Agentic Wallet", "Receipt"].map((step, index) => (
            <li key={step}>{index + 1}. {step}</li>
          ))}
        </ol>
      </header>

      <section className="mt-6" aria-labelledby="signals">
        <h2 id="signals" className="kicker">Live market context · {ticker}</h2>
        {!signals ? <p className="mt-3 text-sm text-dim">No quote book yet. Open Markets or the desk to load rails.</p> : <SignalGrid signals={signals} />}
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="catalog">
          <h2 id="catalog" className="kicker">Catalog</h2>
          <ul className="mt-3">
            {STRATEGY_CATALOG.map((item) => {
              const row = advice.find((entry) => entry.id === item.id);
              const job = jobs.find((saved) => saved.type === item.jobType && (item.id === "index_core" || saved.name.includes(ticker)));
              const presence = strategyPresence(row, job);
              return (
                <li key={item.id} className="border-t border-line">
                  <button type="button" className="min-h-11 w-full py-3 text-left" aria-pressed={picked === item.id} onClick={() => setPicked(item.id)}>
                    <span className="text-sm">{item.name}</span>
                    <span className="mt-1 block text-[11px] text-dim">{item.kicker} · {presence} · {item.cadenceHint}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <h3 className="kicker mt-6">Agent worker</h3>
          <ul className="mt-2 text-sm text-dim">
            {(Object.keys(AGENT_STRATEGY_NAMES) as AgentStrategyType[]).map((id) => (
              <li key={id} className="border-t border-line py-2">{AGENT_STRATEGY_NAMES[id]}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="selected-strategy">
          <h2 id="selected-strategy" className="kicker">{card.name}</h2>
          <p className="mt-2 text-sm text-dim">{card.kicker}</p>
          <p className="mt-4 text-sm">{card.thesis}</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div><dt className="text-dim">When it fires</dt><dd>{card.when}</dd></div>
            <div><dt className="text-dim">When it skips</dt><dd>{card.skip}</dd></div>
            <div><dt className="text-dim">Rails</dt><dd>{card.rails}</dd></div>
            <div><dt className="text-dim">Cadence</dt><dd>{card.cadenceHint}</dd></div>
          </dl>
          <Decision advice={decision} />
          <p className="mt-4 text-sm">Strategy rule: {rule || "—"}. Global policy still applies and is not overridden.</p>
          <p className="mt-2 text-sm text-dim">Minimum net edge {settings ? `${settings.minNetEdgePct}%` : "—"} · order cap {settings ? `${settings.orderCapUsdt} USDT` : "—"} · kill switch {settings?.killSwitch ? "ON" : "OFF"}</p>
          {settings?.killSwitch ? <p className="mt-2 text-sm text-down">KILL SWITCH ON. ARMING DISABLED.</p> : null}
          <p className="mt-3 text-sm text-dim">This creates a policy-bound strategy job. It does not bypass execution controls.</p>
          <div className="mt-4">
            <StrategyArm preset={card.jobType ? (card.id as StrategyPick) : undefined} />
          </div>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link href={marketHref(ticker)} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View market</Link>
            <Link href={opportunityHref(ticker)} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View opportunity</Link>
            <Link href="/activity" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View activity</Link>
          </div>
        </section>
      </div>

      <section className="mt-8 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
        <div>
          <h2 className="kicker">Armed jobs</h2>
          {!jobs.length ? <p className="mt-3 text-sm text-dim">No saved strategy job.</p> : null}
          <ul>
            {jobs.map((job) => (
              <li key={job.id} className="border-t border-line py-3 text-sm">
                <p>{job.name} · {job.paused ? "PAUSED" : "ARMED"}</p>
                <p className="text-dim">{job.cadence} · {job.lastAction || "no action recorded"}{job.lastAt ? ` · ${new Date(job.lastAt).toISOString()}` : ""}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="kicker">Execution</h2>
          <p className="mt-3 text-sm">Agentic Wallet {wallet}{wallet === "CONNECTED" && agentAddress ? ` · ${shortAddr(agentAddress)}` : ""} · BSC mainnet · Agentic market order</p>
          <p className="mt-2 text-sm">BNB Agent Studio {studioStatus}. A2A, MCP, and B402/X402 stay on the Studio runtime. ONLINE only after the desk ping.</p>
          <p className="mt-3 text-sm text-dim">Recent agent fills: {fills.length ? fills.slice(0, 3).map((fill) => `${fill.ticker} ${fill.status}`).join(" · ") : "none"}</p>
        </div>
      </section>
    </div>
  );
}

function SignalGrid({ signals }: { signals: DeskSignals }) {
  const rows: Array<[string, string]> = [
    ["Cash session", signals.session.label],
    ["Cash status", signals.cashDark ? "CLOSED" : "OPEN"],
    ["Friday close", num(signals.fridayClose)],
    ["Prior close", num(signals.priorClose)],
    ["Prior open", num(signals.priorOpen)],
    ["Session open", num(signals.sessionOpen)],
    ["Best open rail", signals.cheapest?.symbol || "—"],
    ["Richest rail", signals.richest?.symbol || "—"],
    ["Cross-rail bps", signals.crossRailBps == null ? "—" : signals.crossRailBps.toFixed(1)],
    ["Gap vs prior close", signals.gapVsPriorClose == null ? "—" : `${signals.gapVsPriorClose.toFixed(2)}%`],
    ["Gap vs Friday", signals.gapVsFriday == null ? "—" : `${signals.gapVsFriday.toFixed(2)}%`],
    ["Gap vs prior open", signals.gapVsPriorOpen == null ? "—" : `${signals.gapVsPriorOpen.toFixed(2)}%`],
    ["Gap vs session open", signals.gapVsSessionOpen == null ? "—" : `${signals.gapVsSessionOpen.toFixed(2)}%`],
    ["Open rails", signals.openRails.length ? signals.openRails.join(" ") : "—"],
  ];
  return (
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-dim">{label}</dt>
          <dd className="num mt-1">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Decision({ advice }: { advice?: Advice }) {
  if (!advice) return <p className="mt-4 text-sm text-dim">No decision until a quote book is loaded.</p>;
  const presence = strategyPresence(advice, null);
  return (
    <div className="mt-4">
      <p className="text-sm">
        <StatusChip tone={presence === "FIRE" ? "open" : presence === "SKIP" ? "closed" : "pending"}>{presence}</StatusChip>
      </p>
      <p className="mt-2 text-sm">{advice.headline}</p>
      <p className="mt-1 text-sm text-dim">{advice.reason}</p>
    </div>
  );
}
