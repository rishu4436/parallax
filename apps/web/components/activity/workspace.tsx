"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  activityCounts,
  activityEvents,
  commitmentFacts,
  formatPx,
  queryActivity,
  replaySteps,
  shortPassportHash,
  type ActivityEvent,
  type ActivityLens,
  type ActivityWindow,
  type ExecutionPassport,
  type ExecutionReceipt,
  type Rail,
  type SigningCommitment,
} from "@parallax/core";
import { ExecutionPassportPanel } from "@/components/execution-passport";
import { useParallax } from "@/lib/store";

interface ActivityPayload {
  ok?: boolean;
  tape?: Parameters<typeof activityEvents>[0]["tape"];
  fills?: Parameters<typeof activityEvents>[0]["fills"];
  receipts?: ExecutionReceipt[];
  passports?: ExecutionPassport[];
  commitments?: SigningCommitment[];
}

export function ActivityWorkspace() {
  const demoActivity = useParallax((s) => s.activity);
  const [payload, setPayload] = useState<ActivityPayload | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lens, setLens] = useState<ActivityLens>("all");
  const [status, setStatus] = useState("all");
  const [rail, setRail] = useState<"all" | Rail>("all");
  const [windowName, setWindowName] = useState<ActivityWindow>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    const res = await fetch("/api/activity", { cache: "no-store" });
    const body = (await res.json()) as ActivityPayload;
    if (!res.ok || body.ok === false) {
      setError("Activity store did not answer.");
      return;
    }
    setError(null);
    setPayload(body);
  }

  useEffect(() => {
    void load();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const source = new EventSource("/api/agent-log");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = () => {
      setLive(true);
      void load();
    };
    return () => {
      window.clearInterval(clock);
      source.close();
    };
  }, []);

  const events = useMemo(
    () => activityEvents({ tape: payload?.tape, fills: payload?.fills, receipts: payload?.receipts, passports: payload?.passports }),
    [payload],
  );
  const rows = useMemo(
    () => queryActivity(events, { lens, status, rail, window: windowName, search, now }),
    [events, lens, status, rail, windowName, search, now],
  );
  const counts = activityCounts(events);
  const selected = rows.find((row) => row.id === selectedId) || events.find((row) => row.id === selectedId) || null;
  const passport = selected?.passportHash ? payload?.passports?.find((item) => item.hash === selected.passportHash) || null : null;
  const commitment = selected?.commitmentHash ? payload?.commitments?.find((item) => item.hash === selected.commitmentHash) || null : null;
  const receipt = selected?.receiptId ? payload?.receipts?.find((item) => item.id === selected.receiptId) || null : null;
  const facts = commitmentFacts(commitment, selected?.passportHash);
  const steps = replaySteps({ passport, receipt, commitment });
  const demos = demoActivity.filter((row) => row.demo);

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Activity</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Every Parallax decision, commitment, and execution in one timeline.</h1>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
          <Count label="Executions" value={String(counts.executions)} />
          <Count label="Passports" value={String(counts.passports)} />
          <Count label="Receipts" value={String(counts.receipts)} />
          <Count label="Agent actions" value={String(counts.agentActions)} />
        </dl>
        <p className="mt-4 text-sm text-dim">{live ? "LIVE ACTIVITY · server-sent events from the agent log" : "Historical records. The agent log stream is not connected."}</p>
        {error ? <p className="mt-2 text-sm text-down">{error}</p> : null}
      </header>

      <form className="mt-6 grid gap-3 md:grid-cols-5" onSubmit={(event) => event.preventDefault()}>
        <label className="text-[11px] tracking-[0.14em] text-dim md:col-span-2">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search ticker, symbol, or hash" className="mt-1 h-11 w-full border border-line bg-transparent px-3 text-sm outline-none focus:border-gold" />
        </label>
        <Select label="Source" value={lens} onChange={(value) => setLens(value as ActivityLens)}>
          <option value="all">All</option>
          <option value="user">User</option>
          <option value="agent">Agent</option>
          <option value="strategy">Strategy</option>
        </Select>
        <Select label="Status" value={status} onChange={setStatus}>
          <option value="all">All</option>
          {["SUBMITTED", "FILLED", "FAILED", "EXPIRED", "CANCELLED", "SKIPPED"].map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </Select>
        <Select label="Rail" value={rail} onChange={(value) => setRail(value as "all" | Rail)}>
          <option value="all">All</option>
          <option value="bStock">bStocks</option>
          <option value="ondo">Ondo</option>
          <option value="xStock">xStocks</option>
        </Select>
        <Select label="Date" value={windowName} onChange={(value) => setWindowName(value as ActivityWindow)}>
          <option value="all">All</option>
          <option value="today">Last 24 hours</option>
          <option value="7d">7 days</option>
        </Select>
      </form>

      {!events.length ? (
        <div className="mt-8">
          <p className="text-sm text-dim">No executions recorded yet.</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link href="/markets" className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">Explore markets</Link>
            <Link href="/opportunities" className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">View opportunities</Link>
            <Link href="/agents" className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">Open agents</Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <section aria-labelledby="timeline">
            <h2 id="timeline" className="kicker">Timeline</h2>
            {!rows.length ? <p className="mt-3 text-sm text-dim">No records match this filter.</p> : null}
            <ul className="mt-3">
              {rows.map((row) => (
                <li key={row.id} className="border-t border-line">
                  <button type="button" className="min-h-11 w-full py-3 text-left" aria-pressed={selected?.id === row.id} onClick={() => setSelectedId(row.id)}>
                    <span className="num text-[11px] text-dim">{new Date(row.at).toISOString()}</span>
                    <span className="mt-1 block text-sm">
                      {row.side.toUpperCase()} {row.ticker} · {row.notional} USDT · {row.symbol} · {row.status}
                    </span>
                    <span className="mt-1 block text-[11px] text-dim">
                      {row.source} · {row.rail}
                      {row.passportHash ? ` · passport ${shortPassportHash(row.passportHash)}` : ""}
                      {row.commitmentHash ? ` · commitment ${shortPassportHash(row.commitmentHash)}` : ""}
                      {row.receiptHash ? ` · receipt ${shortPassportHash(row.receiptHash)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <EventDetail event={selected} passport={passport} facts={facts} receipt={receipt} steps={steps} />
        </div>
      )}

      {demos.length ? (
        <section className="mt-8 border-t border-line pt-6">
          <h2 className="text-[11px] tracking-[0.16em] text-gold">DEMO DATA</h2>
          <ul className="mt-3 text-sm text-gold">
            {demos.map((row) => (
              <li key={`${row.at}-${row.text}`}>{row.text}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function EventDetail({
  event,
  passport,
  facts,
  receipt,
  steps,
}: {
  event: ActivityEvent | null;
  passport: ExecutionPassport | null;
  facts: ReturnType<typeof commitmentFacts>;
  receipt: ExecutionReceipt | null;
  steps: ReturnType<typeof replaySteps>;
}) {
  if (!event) return <p className="text-sm text-dim">Select an execution. Nothing here resubmits or signs.</p>;
  const body = passport?.body;
  return (
    <section aria-labelledby="event-detail">
      <h2 id="event-detail" className="kicker">Recorded at execution</h2>
      <dl className="mt-4 grid gap-2 text-sm">
        <Field label="When" value={new Date(event.at).toISOString()} />
        <Field label="Source" value={event.source} />
        <Field label="Ticker" value={event.ticker} />
        <Field label="Side" value={event.side} />
        <Field label="Notional" value={`${event.notional} USDT`} />
        <Field label="Rail" value={event.rail} />
        <Field label="Symbol" value={event.symbol} />
        <Field label="Vendor" value={event.vendor || body?.vendor || "—"} />
      </dl>
      <h3 className="kicker mt-6">Quote</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <Field label="Reference" value={body?.reference.price ? formatPx(body.reference.price) : "—"} />
        <Field label="Tokenized price" value={body && body.quote.perShare > 0 ? formatPx(body.quote.perShare) : "—"} />
        <Field label="Gross gap" value="—" />
        <Field label="Price impact" value={body?.priceImpactPct == null ? "—" : `${body.priceImpactPct}%`} />
        <Field label="Network fee" value={body?.networkFeeUsd == null ? "—" : formatPx(body.networkFeeUsd)} />
        <Field label="Gas estimate" value={body?.gasEstimateUsd == null ? body?.estimatedGasUnits || "—" : formatPx(body.gasEstimateUsd)} />
        <Field label="Trade fee" value={body?.tradeFeeUsd == null ? "—" : formatPx(body.tradeFeeUsd)} />
        <Field label="Quoted" value={body ? new Date(body.quotedAt).toISOString() : "—"} />
        <Field label="Quote expiry" value={body ? new Date(body.expiresAt).toISOString() : "—"} />
      </dl>
      <p className="mt-2 text-[11px] text-dim">Gross gap was not stored on the passport. These prices are the recorded quote, not the current market.</p>

      <h3 className="kicker mt-6">Passport</h3>
      {passport ? (
        <>
          <p className="num mt-2 break-all text-[11px] text-dim">{passport.hash}</p>
          <p className="mt-2 text-sm">{passport.state} · {passport.body.intent.ticker} · {passport.body.representation.symbol} · policy {passport.gate?.verdict || "—"}</p>
          <ExecutionPassportPanel passport={passport} />
        </>
      ) : (
        <p className="mt-2 text-sm text-dim">{event.passportHash ? `Passport ${event.passportHash.slice(0, 12)} is not in this store.` : "No passport was stored for this event."}</p>
      )}

      <h3 className="kicker mt-6">Policy</h3>
      {passport?.gate ? (
        <div className="mt-2 text-sm">
          <p>{passport.gate.verdict}</p>
          <ul className="mt-2 space-y-1 text-dim">
            {passport.gate.checks.map((check) => (
              <li key={check.id}>{check.id} · {check.pass ? "PASS" : check.verdict}</li>
            ))}
          </ul>
          {passport.gate.primary ? <p className="mt-2">{passport.gate.primary.code}. {passport.gate.primary.human} Next: {passport.gate.primary.nextAction}.</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-dim">No policy decision was stored on this passport.</p>
      )}

      <h3 className="kicker mt-6">Signing commitment</h3>
      <p className="mt-2 text-sm">{facts.scheme || "—"} · {facts.pair}</p>
      <p className="num break-all text-[11px] text-dim">{facts.hash || "—"}</p>
      {facts.evm ? (
        <dl className="mt-2 grid gap-1 text-sm">
          <Field label="Chain" value={facts.evm.chainId || "—"} />
          <Field label="From" value={facts.evm.from || "—"} />
          <Field label="To" value={facts.evm.to || "—"} />
          <Field label="Value" value={facts.evm.value || "—"} />
          <Field label="Selector" value={facts.evm.selector || "—"} />
          <Field label="Nonce" value={facts.evm.nonce || "—"} />
          <Field label="Gas limit" value={facts.evm.gasLimit || "—"} />
          <Field label="Gas price" value={facts.evm.gasPrice || "—"} />
          <Field label="Max fee" value={facts.evm.maxFeePerGas || "—"} />
          <Field label="Priority fee" value={facts.evm.maxPriorityFeePerGas || "—"} />
          <Field label="Type" value={facts.evm.transactionType || "—"} />
        </dl>
      ) : null}
      {facts.rfq ? <p className="mt-2 text-sm">EIP-712 {facts.rfq.primaryType || "—"} · {facts.rfq.domain || "—"} · chain {facts.rfq.chainId || "—"}</p> : null}
      {facts.agentic ? <p className="mt-2 text-sm">AGENTIC WALLET · {facts.agentic.side || "—"} · qty {facts.agentic.fromQty || "—"}</p> : null}
      <p className="mt-2 text-[11px] text-dim">Passport → commitment → receipt. This page does not re-sign or rebroadcast.</p>

      <h3 className="kicker mt-6">Receipt</h3>
      {receipt ? (
        <dl className="mt-2 grid gap-1 text-sm">
          <Field label="Hash" value={receipt.hash.slice(0, 16)} />
          <Field label="Status" value={receipt.status.toUpperCase()} />
          <Field label="Submitted" value={new Date(receipt.submittedAt).toISOString()} />
          <Field label="Filled" value={receipt.filledAt ? new Date(receipt.filledAt).toISOString() : "—"} />
          <Field label="Transaction" value={receipt.txHash || "—"} />
          <Field label="Order" value={receipt.orderId || "—"} />
          <Field label="Actual output" value={receipt.actualOutput || "—"} />
          <Field label="Realized slippage" value={receipt.realizedSlippageBps == null ? "—" : `${receipt.realizedSlippageBps} bps`} />
          <Field label="Note" value={receipt.note || "—"} />
        </dl>
      ) : (
        <p className="mt-2 text-sm text-dim">No receipt was stored.</p>
      )}

      <h3 className="kicker mt-6">Recorded chain</h3>
      <ol className="mt-2 space-y-2 text-sm">
        {steps.map((step) => (
          <li key={step.label}>
            {step.label} · {step.at == null ? "TIME NOT RECORDED" : new Date(step.at).toISOString()}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap gap-4">
        {event.ticker && event.ticker !== "—" ? <Link href={`/markets/${event.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View market</Link> : null}
        {event.ticker && event.ticker !== "—" ? <Link href={`/opportunities?ticker=${event.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View opportunity</Link> : null}
        {event.source === "AGENT" || event.source === "STRATEGY" ? <Link href="/agents" className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">View agent</Link> : null}
      </div>
    </section>
  );
}

function Count({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="num mt-1">{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-1">
      <dt className="text-dim">{label}</dt>
      <dd className="num text-right">{value}</dd>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="text-[11px] tracking-[0.14em] text-dim">
      {label}
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full border border-line bg-bg px-3 text-sm outline-none focus:border-gold">
        {children}
      </select>
    </label>
  );
}
