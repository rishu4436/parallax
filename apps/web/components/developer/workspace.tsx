"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  DEVELOPER_APIS,
  activityEvents,
  agenticAvailability,
  cashSession,
  MCP_TOOLS,
  developerStats,
  groupErrors,
  integrationFindings,
  observeCall,
  reliability,
  shortAddr,
  studioDeskStatus,
  type ExecutionPassport,
  type ExecutionReceipt,
  type ObservedCall,
  type SigningCommitment,
  type TapeRow,
} from "@parallax/core";
import { useParallax } from "@/lib/store";

interface DevPayload {
  ok?: boolean;
  source?: string;
  retained?: number;
  events?: Array<{ at: string; path: string; kind?: string; status?: number; ttfbMs?: number; retries?: number; ok?: boolean; errorCode?: number; note?: string }>;
}

export function DeveloperWorkspace() {
  const session = useParallax((s) => s.session);
  const settings = useParallax((s) => s.settings);
  const studio = useParallax((s) => s.studio);
  const beat = useParallax((s) => s.beat);
  const opportunities = useParallax((s) => s.opportunities);
  const books = useParallax((s) => s.books);
  const walletAddress = useParallax((s) => s.wallet);
  const ticker = useParallax((s) => s.ticker);
  const refreshScan = useParallax((s) => s.refreshScan);
  const refreshQuote = useParallax((s) => s.refreshQuote);
  const refreshDesk = useParallax((s) => s.refreshDesk);
  const [payload, setPayload] = useState<DevPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [latest, setLatest] = useState<{ tape: TapeRow[]; passports: ExecutionPassport[]; receipts: ExecutionReceipt[]; commitments: SigningCommitment[] } | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/developer", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: DevPayload) => {
        if (!cancel) setPayload(body.ok === false ? null : body);
        if (!cancel && body.ok === false) setError("Telemetry did not load.");
      })
      .catch(() => {
        if (!cancel) setError("Telemetry did not load.");
      });
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
    void fetch("/api/activity", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (!cancel && body.ok) setLatest(body);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const calls = useMemo(() => (payload?.events || []).map((event) => observeCall(event)), [payload]);
  const stats = developerStats(calls);
  const shown = calls.filter((call) => filter === "all" || call.group === filter || call.operation === filter || call.path.includes(filter));
  const wallet = agenticAvailability(agentStatus);
  const studioStatus = studioDeskStatus({ deskKnown: session != null || beat != null, live: studio.live });
  const cash = session || cashSession();
  const execution = latest ? activityEvents(latest)[0] : undefined;
  const rates = reliability(calls);
  const errorGroups = groupErrors(calls);
  const findings = integrationFindings(calls, opportunities);
  async function reloadTelemetry() {
    const res = await fetch("/api/developer", { cache: "no-store" });
    const body = (await res.json()) as DevPayload;
    setPayload(body.ok === false ? null : body);
  }
  async function inspectRead(label: string, action: () => Promise<void>) {
    setInspect(label);
    try {
      await action();
      setInspect(`${label} finished. No signature was requested.`);
    } catch (err) {
      setInspect(err instanceof Error ? err.message : "The read failed.");
    }
    await reloadTelemetry();
  }
  const passport = execution?.passportHash ? latest?.passports.find((item) => item.hash === execution.passportHash) : undefined;

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Developer</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Integration telemetry, execution diagnostics, and API surface.</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">OBSERVED REQUESTS from the existing devex log, last {payload?.retained ?? 200}. Unobserved fields stay blank. This page does not sign or submit.</p>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Item label="BSC" value="MAINNET · 56" />
          <Item label="Binance calls" value={stats.count ? `${stats.success} ok · ${stats.failure} failed` : "—"} />
          <Item label="Agentic Wallet" value={wallet} />
          <Item label="Agent Studio" value={studioStatus} />
          <Item label="Session" value={cash.label} />
          <Item label="Kill switch" value={settings?.killSwitch ? "ON" : "OFF"} />
        </dl>
        {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
      </header>

      <section className="mt-8" aria-labelledby="overview">
        <h2 id="overview" className="kicker">Integration overview</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Item label="Observed requests" value={String(stats.count)} />
          <Item label="Median latency" value={stats.medianMs == null ? "—" : `${Math.round(stats.medianMs)} ms`} />
          <Item label="p95 latency" value={stats.p95Ms == null ? "—" : `${Math.round(stats.p95Ms)} ms`} />
          <Item label="Last success" value={stats.lastOkAt || "—"} />
          <Item label="Last error" value={stats.lastError || "—"} />
          <Item label="Agent address" value={wallet === "CONNECTED" && agentAddress ? shortAddr(agentAddress) : "—"} />
        </dl>
        <p className="mt-3 text-[11px] text-dim">p95 appears after 20 observed latency samples. A blank median means this process has not recorded a Binance call.</p>
      </section>

      <section className="mt-8" aria-labelledby="surface">
        <h2 id="surface" className="kicker">API surface</h2>
        <ul className="mt-3">
          {DEVELOPER_APIS.map((row) => {
            const matches = calls.filter((call) => call.path.includes(row.path));
            const rowStats = developerStats(matches);
            return (
              <li key={row.path} className="border-t border-line py-3 text-sm">
                <p>{row.group} · {row.name}</p>
                <p className="text-dim">{row.path} · {row.operation} · {row.purpose}</p>
                <p className="num text-dim">observed {rowStats.count} · ok {rowStats.success} · failed {rowStats.failure} · median {rowStats.medianMs == null ? "—" : `${Math.round(rowStats.medianMs)} ms`}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="log">
        <h2 id="log" className="kicker">Request log</h2>
        <label className="mt-3 block text-[11px] tracking-[0.14em] text-dim">
          Filter
          <input value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter requests" className="mt-1 h-11 w-full max-w-sm border border-line bg-transparent px-3 text-sm outline-none focus:border-gold" />
        </label>
        {!shown.length ? <p className="mt-3 text-sm text-dim">No observed requests in this log.</p> : null}
        <ul className="mt-3">
          {shown.slice().reverse().slice(0, 40).map((call, index) => (
            <li key={`${call.at}-${call.path}-${index}`} className="border-t border-line py-2 text-sm">
              <LogLine call={call} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="errors">
        <h2 id="errors" className="kicker">Error observatory</h2>
        {!errorGroups.length ? <p className="mt-3 text-sm text-dim">No observed errors or retries. Categories with no evidence are omitted.</p> : null}
        <ul>
          {errorGroups.map((group) => (
            <li key={group.category} className="border-t border-line py-2 text-sm">
              {group.category} · {group.count} · {group.latestAt} · {group.message || "—"} · {group.path || "—"}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="reliability">
        <h2 id="reliability" className="kicker">Reliability</h2>
        {!rates.observed ? <p className="mt-3 text-sm">NO OBSERVATIONS</p> : null}
        {rates.observed ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <Item label="Requests" value={String(rates.count)} />
            <Item label="Success rate" value={rates.successRate == null ? "—" : `${Math.round(rates.successRate * 100)}%`} />
            <Item label="Error rate" value={rates.errorRate == null ? "—" : `${Math.round(rates.errorRate * 100)}%`} />
            <Item label="Median" value={rates.medianMs == null ? "—" : `${Math.round(rates.medianMs)} ms`} />
            <Item label="p95" value={rates.p95Ms == null ? "—" : `${Math.round(rates.p95Ms)} ms`} />
            <Item label="Timeouts" value={rates.timeouts == null ? "—" : String(rates.timeouts)} />
            <Item label="Recorded retries" value={rates.retries == null ? "—" : String(rates.retries)} />
            <Item label="Quote expiries" value={rates.quoteExpiries == null ? "—" : String(rates.quoteExpiries)} />
          </dl>
        ) : null}
        <p className="mt-2 text-[11px] text-dim">Rates need 5 finished calls. p95 needs 20. A blank retry total means retries were not recorded, not that the count is zero.</p>
      </section>

      <section className="mt-8" aria-labelledby="inspect">
        <h2 id="inspect" className="kicker">Read-only inspection</h2>
        <p className="mt-2 text-sm text-dim">These buttons call the existing scan, quote, desk, and prepare routes. They do not broadcast and they do not accept a URL or calldata.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.12em]" onClick={() => void inspectRead("Scan", () => refreshScan())}>Refresh scan</button>
          <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.12em]" onClick={() => void inspectRead("Quote", () => refreshQuote())}>Refresh quote</button>
          <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.12em]" onClick={() => void inspectRead("Balances", () => refreshDesk())}>Refresh balances</button>
          <button type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.12em]" disabled={!walletAddress} onClick={() => void dryRun()}>Dry-run prepare</button>
        </div>
        {inspect ? <p className="mt-3 text-sm text-dim">{inspect}</p> : null}
      </section>

      <section className="mt-8" aria-labelledby="mcp">
        <h2 id="mcp" className="kicker">MCP and Agent Studio</h2>
        <p className="mt-2 text-sm">LLM tools do not hold or control signing authority. Signing allowed: NO.</p>
        <ul className="mt-3">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="border-t border-line py-2 text-sm">
              <span className="num">{tool.name}</span> · {tool.access} · {tool.summary} · signs NO
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">Agent Studio {studioStatus}. Faces: A2A, MCP, B402/X402. Network: BSC mainnet. Execution stays on the Agentic Wallet ({wallet}).</p>
      </section>

      <section className="mt-8" aria-labelledby="findings">
        <h2 id="findings" className="kicker">Integration findings</h2>
        {!findings.length ? <p className="mt-3 text-sm text-dim">No finding is supported by the current observations.</p> : null}
        <ul>
          {findings.map((finding) => (
            <li key={finding.observation} className="border-t border-line py-3 text-sm">
              <p>Observation. {finding.observation}</p>
              <p className="text-dim">Evidence. {finding.evidence}</p>
              <p className="text-dim">Impact. {finding.impact}</p>
              <p className="text-dim">Requested capability. {finding.request}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="lifecycle">
        <h2 id="lifecycle" className="kicker">Latest recorded execution</h2>
        {!execution ? <p className="mt-3 text-sm text-dim">No execution is stored. Quote → passport → policy → commitment → wallet → receipt.</p> : null}
        {execution ? (
          <div className="mt-3 text-sm">
            <p>{execution.ticker} · {execution.status} · {execution.source}</p>
            <p className="text-dim">Passport {execution.passportHash || "—"} · commitment {execution.commitmentHash || "—"} · receipt {execution.receiptHash || "—"}</p>
            <p className="text-dim">Policy {passport?.gate?.verdict || "—"} · requirement {passport?.body.executionRequirement || "—"}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <Link href="/activity" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View activity</Link>
              {execution.ticker !== "—" ? <Link href={`/markets/${execution.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View market</Link> : null}
              {execution.ticker !== "—" ? <Link href={`/opportunities?ticker=${execution.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View opportunity</Link> : null}
              <Link href="/agents" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View agents</Link>
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8" aria-labelledby="rails">
        <h2 id="rails" className="kicker">Tokenized stock diagnostics</h2>
        {!opportunities.length ? <p className="mt-3 text-sm text-dim">No scan is loaded in this session.</p> : null}
        <ul>
          {opportunities.filter((card) => (card.perShare != null && card.perShare > 0) || card.status !== "OPEN").slice(0, 12).map((card) => (
            <li key={`${card.ticker}-${card.rail}`} className="border-t border-line py-2 text-sm">
              {card.ticker} · {card.symbol} · {card.rail} · {card.status} · price {card.perShare != null && card.perShare > 0 ? card.perShare : "—"} · reference {card.reference != null && card.reference > 0 ? card.reference : "—"} · impact {card.priceImpactPct ?? "—"} · network {card.networkFeeUsd ?? "—"} · gas {card.gasEstimateUsd ?? card.estimatedGasUnits ?? "—"} · fee {card.tradeFeeUsd ?? "—"}
              {card.errorText ? ` · ${card.errorText}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  async function dryRun() {
    const quote = books.find((book) => book.best?.ok)?.best;
    if (!quote || !walletAddress) {
      setInspect("Dry-run needs a connected wallet and a live quote. It does not sign.");
      return;
    }
    setInspect("Dry-run prepare");
    const res = await fetch("/api/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: { ticker, side: "buy", usdt: "10", wallet: walletAddress, actor: "user", railLock: quote.wrapper.rail },
        quote,
      }),
    });
    const body = (await res.json()) as { step?: string; message?: string };
    setInspect(body.step ? `Prepare returned ${body.step}. Not broadcast.` : body.message || "Prepare did not return a step.");
    await reloadTelemetry();
  }
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function LogLine({ call }: { call: ObservedCall }) {
  const result = call.ok === true ? "OK" : call.ok === false ? "ERROR" : call.kind === "rate_limit" ? "RETRY" : "—";
  return (
    <span>
      {call.at} · {call.group} · {call.operation} · {call.latencyMs == null ? "—" : `${Math.round(call.latencyMs)} ms`} · {call.status ?? "—"} · {result}
      <span className="block text-[11px] text-dim">{call.path}{call.note ? ` · ${call.note}` : ""}</span>
    </span>
  );
}
