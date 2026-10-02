"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  COPY,
  activityForTicker,
  agenticAvailability,
  cardForRail,
  cashSession,
  evaluatePolicy,
  formatAge,
  flagReasons,
  limitsFromSettings,
  marketCatalog,
  opportunityQueue,
  queryOpportunityQueue,
  quoteAgeLabel,
  scanPhase,
  shortAddr,
  studioDeskStatus,
  universeCounts,
  type OpportunityLens,
  type OpportunityQueueRow,
  type OpportunitySort,
  type Rail,
} from "@parallax/core";
import { ExecutionPassportPanel } from "@/components/execution-passport";
import { Button } from "@/components/ui/button";
import { StatusChip, railTone } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useParallax } from "@/lib/store";
import { RAIL_LABEL, SESSION_WORD, money, pct, statusWord } from "@/components/markets/format";

const RAILS: Rail[] = ["bStock", "ondo", "xStock"];

function asRail(value: string | null): Rail | null {
  if (value === "bStock" || value === "ondo" || value === "xStock") return value;
  return null;
}

export function OpportunitiesWorkspace() {
  const router = useRouter();
  const search = useSearchParams();
  const opportunities = useParallax((s) => s.opportunities);
  const scanning = useParallax((s) => s.scanning);
  const scanAt = useParallax((s) => s.scanAt);
  const scanError = useParallax((s) => s.scanError);
  const session = useParallax((s) => s.session);
  const settings = useParallax((s) => s.settings);
  const spentToday = useParallax((s) => s.spentToday);
  const books = useParallax((s) => s.books);
  const passport = useParallax((s) => s.passport);
  const tape = useParallax((s) => s.tape);
  const demo = useParallax((s) => s.demo);
  const studio = useParallax((s) => s.studio);
  const beat = useParallax((s) => s.beat);
  const wallet = useParallax((s) => s.wallet);
  const usdt = useParallax((s) => s.usdt);
  const quoting = useParallax((s) => s.quoting);
  const quoteError = useParallax((s) => s.quoteError);
  const selectTicker = useParallax((s) => s.selectTicker);
  const lockRail = useParallax((s) => s.lockRail);
  const openConfirm = useParallax((s) => s.openConfirm);
  const refreshScan = useParallax((s) => s.refreshScan);
  const refreshQuote = useParallax((s) => s.refreshQuote);
  const queueCopilot = useParallax((s) => s.queueCopilot);
  const [lens, setLens] = useState<OpportunityLens>("all");
  const [railFilter, setRailFilter] = useState<"all" | Rail>("all");
  const [sort, setSort] = useState<OpportunitySort>("net");
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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

  const cash = session || cashSession();
  const cashOpen = cash.atmosphere === "open";
  const counts = useMemo(() => universeCounts(marketCatalog()), []);
  const phase = scanPhase({ scanning, error: scanError, cards: opportunities.length, scanAt, now });
  const limits = limitsFromSettings(settings, Number(usdt) || 10);
  const queue = useMemo(() => opportunityQueue(opportunities), [opportunities]);
  const rows = useMemo(
    () => queryOpportunityQueue(queue, { lens, search: text, rail: railFilter, sort, cashOpen, now, limits, sizeUsdt: Number(usdt) || 10 }),
    [queue, lens, text, railFilter, sort, cashOpen, now, limits, usdt],
  );
  const tickerParam = (search.get("ticker") || "").toUpperCase();
  const railParam = asRail(search.get("rail"));
  const selectedRow = queue.find((row) => row.ticker === tickerParam) || null;
  const selectedCard = selectedRow ? (railParam ? cardForRail(selectedRow.rails, selectedRow.ticker, railParam) : selectedRow.card) : null;

  useEffect(() => {
    if (!tickerParam) return;
    void selectTicker(tickerParam, railParam ?? undefined);
  }, [tickerParam, railParam, selectTicker]);

  function choose(row: OpportunityQueueRow, rail?: Rail) {
    const nextRail = rail || row.card.rail;
    const params = new URLSearchParams(search.toString());
    params.set("ticker", row.ticker);
    params.set("rail", nextRail);
    router.replace(`/opportunities?${params.toString()}`, { scroll: false });
    lockRail(nextRail);
  }

  const book = selectedCard ? books.find((item) => item.wrapper.rail === selectedCard.rail) : undefined;
  const quote = book?.best;
  const reference = selectedCard && selectedCard.reference > 0 ? selectedCard.reference : null;
  const policy =
    selectedCard && settings
      ? evaluatePolicy({
          source: "ui",
          mode: "preview",
          now,
          intent: {
            ticker: selectedCard.ticker,
            side: "buy",
            usdt: usdt || "10",
            wallet: wallet || "0x0000000000000000000000000000000000000000",
            railLock: selectedCard.rail,
            actor: "user",
          },
          settings,
          spentToday,
          quote: quote?.wrapper.rail === selectedCard.rail ? quote : null,
          signer: wallet ?? null,
          reference: { price: reference, label: selectedCard.referenceLabel },
          liquidity: selectedCard.liquidity > 0 ? selectedCard.liquidity : undefined,
          executionRequirement: selectedCard.mode === "RFQ" ? "RFQ" : "EVM_SIMULATION",
        })
      : null;
  const lines = selectedCard ? flagReasons({ cashOpen, card: selectedCard.perShare > 0 && reference ? selectedCard : null, limits, sizeUsdt: Number(usdt) || 10 }) : [];
  const activity = selectedCard ? activityForTicker(tape, selectedCard.ticker) : [];
  const age = quoteAgeLabel(selectedCard?.quoteExpiresAt ?? null, now);
  const agent = agenticAvailability(agentStatus);
  const studioStatus = studioDeskStatus({ deskKnown: Boolean(beat), live: studio.live });
  const executable = Boolean(selectedCard && selectedCard.status === "OPEN" && !age.stale && quote?.ok && quote.wrapper.rail === selectedCard.rail);

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Opportunities</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Executable dislocations across tokenized equity rails.</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">{COPY.disclaimer}</p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="kicker">Scan</dt>
            <dd className="mt-1">{phase}</dd>
          </div>
          <div>
            <dt className="kicker">Universe</dt>
            <dd className="num mt-1">
              {counts.assets} assets · {counts.rails} rails
            </dd>
          </div>
          <div>
            <dt className="kicker">Last scan</dt>
            <dd className="num mt-1">{scanAt ? formatAge(Math.max(0, now - scanAt)) : "—"}</dd>
          </div>
          <div>
            <dt className="kicker">Session</dt>
            <dd className="mt-1">
              {SESSION_WORD[cash.kind] || cash.label} · Cash {cashOpen ? "OPEN" : "CLOSED"} · BSC chain 56
            </dd>
          </div>
        </dl>
        {scanning ? (
          <p className="mt-3 text-sm text-dim" role="status">
            SCANNING BSC
          </p>
        ) : null}
        {scanError ? (
          <p className="mt-3 text-sm text-down" role="alert">
            {scanError}
          </p>
        ) : null}
        {!cashOpen ? (
          <p className="mt-4 max-w-2xl text-sm">
            <span className="text-ink">CASH MARKET CLOSED.</span>{" "}
            <span className="text-dim">Tokenized equity rails can remain active while the underlying cash session is closed. A gap is not an execution until a rail is open and policy passes.</span>
          </p>
        ) : null}
        {demo ? <p className="mt-3 text-[11px] tracking-[0.16em] text-gold">DEMO DATA · desk scenario {demo.label}. This queue is the live scan.</p> : null}
      </header>

      <form className="mt-6 grid gap-3 md:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
        <label className="text-[11px] tracking-[0.14em] text-dim">
          Search
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Search opportunities"
            className="mt-1 h-11 w-full border border-line bg-transparent px-3 text-sm text-ink outline-none focus:border-gold"
          />
        </label>
        <Select label="Show" value={lens} onChange={(value) => setLens(value as OpportunityLens)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="cash-closed">Cash closed</option>
          <option value="cross-rail">Cross-rail</option>
          <option value="attention">Needs attention</option>
        </Select>
        <Select label="Rail" value={railFilter} onChange={(value) => setRailFilter(value as "all" | Rail)}>
          <option value="all">All</option>
          <option value="bStock">bStocks</option>
          <option value="ondo">Ondo</option>
          <option value="xStock">xStocks</option>
        </Select>
        <Select label="Sort" value={sort} onChange={(value) => setSort(value as OpportunitySort)}>
          <option value="net">Absolute net edge</option>
          <option value="gap">Absolute gross gap</option>
          <option value="alpha">Alphabetical</option>
        </Select>
      </form>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section aria-labelledby="opportunity-queue">
          <h2 id="opportunity-queue" className="kicker">
            Queue
          </h2>
          {!rows.length ? <p className="mt-3 text-sm text-dim">{lens === "cash-closed" && cashOpen ? "Cash session is open. This filter is for the closed-cash book." : "No opportunities match this filter."}</p> : null}
          <div className="mt-3 hidden overflow-x-auto desk:block">
            <Table>
              <THead>
                <TR>
                  <TH>Asset</TH>
                  <TH numeric>Reference</TH>
                  <TH numeric>Tokenized</TH>
                  <TH numeric>Gross gap</TH>
                  <TH numeric>Slippage</TH>
                  <TH numeric>Network fee</TH>
                  <TH numeric>Gas</TH>
                  <TH numeric>Trade fee</TH>
                  <TH numeric>Net edge</TH>
                  <TH>Rail</TH>
                  <TH>Status</TH>
                  <TH>Quote</TH>
                  <TH>Action</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <QueueRow key={row.ticker} row={row} now={now} selected={row.ticker === tickerParam} onSelect={() => choose(row)} />
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="mt-3 grid gap-3 desk:hidden">
            {rows.map((row) => (
              <li key={row.ticker} className="border border-line px-4 py-4">
                <button type="button" className="min-h-11 w-full text-left" onClick={() => choose(row)}>
                  <span className="block text-ink">{row.name}</span>
                  <span className="num text-dim">
                    {row.ticker} · {row.card.symbol} · {statusWord(row.card.status)} · net {row.card.perShare > 0 && row.card.reference > 0 ? pct(row.card.netPct) : "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="selected-opportunity">
          <h2 id="selected-opportunity" className="kicker">
            Selected
          </h2>
          {!selectedCard ? <p className="mt-3 text-sm text-dim">Choose an opportunity. Nothing is armed until you prepare a signature.</p> : null}
          {selectedCard ? (
            <div className="mt-4">
              <p className="display text-4xl">{selectedCard.ticker}</p>
              <p className="mt-1 text-dim">{selectedCard.name}</p>
              <p className="mt-3 text-sm">
                Cash {cashOpen ? "OPEN" : "CLOSED"} · Tokenized rail {statusWord(selectedCard.status)}
              </p>
              {age.stale ? (
                <p className="mt-2 text-sm text-warn" role="status">
                  QUOTE STALE. That price is 30 seconds old. Requote.
                </p>
              ) : null}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Reference" value={reference == null ? "REFERENCE UNAVAILABLE" : money(reference)} />
                <Stat label="Tokenized" value={selectedCard.perShare > 0 ? money(selectedCard.perShare) : "—"} />
                <Stat label="Gross gap" value={reference != null && selectedCard.perShare > 0 ? pct(selectedCard.grossPct) : "—"} />
                <Stat label="Estimated net edge" value={reference != null && selectedCard.perShare > 0 ? pct(selectedCard.netPct) : "—"} />
                <Stat label="Quote" value={age.label} warn={age.stale} />
                <Stat label="Rail" value={`${RAIL_LABEL[selectedCard.rail]} · ${selectedCard.symbol}`} />
                <Stat label="Vendor" value={selectedCard.vendor || "—"} />
                <Stat label="Execution mode" value={selectedCard.mode || "—"} />
              </dl>
              {selectedCard.multiplier && selectedCard.multiplier !== 1 ? (
                <p className="mt-3 text-sm text-dim">Per-share equivalent includes wrapper multiplier {selectedCard.multiplier}.</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="#why-flagged" className="inline-flex h-11 items-center px-3 text-[11px] tracking-[0.14em] text-gold">
                  Analyze
                </a>
                <Button type="button" disabled={!executable} onClick={() => book && void openConfirm(book, "buy")}>
                  Simulate
                </Button>
                <Button
                  type="button"
                  tone="primary"
                  disabled={!selectedCard}
                  onClick={() => {
                    lockRail(selectedCard.rail);
                    router.push("/desk");
                  }}
                >
                  Trade
                </Button>
                <Button type="button" onClick={() => void refreshScan().then(() => refreshQuote())}>
                  Requote
                </Button>
              </div>
              {quoteError ? <p className="mt-3 text-sm text-down">{quoteError}</p> : null}
              {quoting ? <p className="mt-3 text-sm text-dim">SCANNING BSC</p> : null}
            </div>
          ) : null}

          <div id="why-flagged" className="mt-8 border-t border-line pt-6">
            <h2 className="kicker">Why flagged</h2>
            {demo ? <p className="mt-2 text-[11px] tracking-[0.16em] text-gold">DEMO DATA</p> : null}
            <ol className="mt-3 space-y-2 text-sm">
              {lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          </div>

          {selectedRow ? (
            <div className="mt-8 border-t border-line pt-6">
              <h2 className="kicker">Rails</h2>
              <ul className="mt-3">
                {RAILS.map((rail) => {
                  const card = cardForRail(selectedRow.rails, selectedRow.ticker, rail);
                  const railAge = quoteAgeLabel(card?.quoteExpiresAt ?? null, now);
                  const selected = railParam === rail;
                  return (
                    <li key={rail} className="border-t border-line py-3 text-sm">
                      <button type="button" className="min-h-11 w-full text-left" aria-pressed={selected} onClick={() => choose(selectedRow, rail)}>
                        <span className="text-ink">
                          {RAIL_LABEL[rail]} {card?.symbol || "—"}
                          {selected ? <span className="ml-2 text-[11px] tracking-[0.12em] text-gold">Selected</span> : null}
                        </span>
                        <span className="mt-1 block text-dim">
                          {card ? statusWord(card.status) : "NO EXECUTABLE QUOTE"} · {card?.mode || "—"} · {card?.vendor || "—"} · {card && card.perShare > 0 ? money(card.perShare) : "—"} · gap {card && card.perShare > 0 && card.reference > 0 ? pct(card.grossPct) : "—"} · impact {card?.priceImpactPct == null ? "—" : pct(card.priceImpactPct)} · network {money(card?.networkFeeUsd)} · gas {card?.gasEstimateUsd == null ? card?.estimatedGasUnits || "—" : money(card.gasEstimateUsd)} · fee {money(card?.tradeFeeUsd)} · {railAge.label}
                        </span>
                        {card?.errorText ? <span className="mt-1 block text-down">{card.errorText}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <div className="mt-8 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
        <section aria-labelledby="execution-control">
          <h2 id="execution-control" className="kicker">
            Execution control
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Policy" value={policy ? policy.verdict : "—"} />
            <Stat label="Order cap" value={settings ? `${settings.orderCapUsdt} USDT` : "—"} />
            <Stat label="Daily cap" value={settings ? `${spentToday.toFixed(2)} / ${settings.dailyCapUsdt} USDT` : "—"} />
            <Stat label="Minimum net edge" value={settings ? `${settings.minNetEdgePct}%` : "—"} />
            <Stat label="Maximum slippage" value={settings ? `${settings.maxSlipPct}%` : "—"} />
            <Stat label="Minimum liquidity" value={settings ? money(settings.minLiquidityUsd) : "—"} />
            <Stat label="Approval" value={settings?.approvalRequired === false ? "OFF" : "REQUIRED"} />
            <Stat label="Kill switch" value={settings?.killSwitch ? "ON" : "OFF"} />
          </dl>
          {policy?.primary ? (
            <p className="mt-4 text-sm text-down">
              {policy.verdict} · {policy.primary.code}. {policy.primary.human} {policy.primary.machine}. Next: {policy.primary.nextAction.replaceAll("_", " ")}.
            </p>
          ) : null}
          <div className="mt-6">
            <h3 className="kicker">Execution passport</h3>
            {passport && selectedCard && passport.body.intent.ticker === selectedCard.ticker ? <ExecutionPassportPanel /> : <p className="mt-3 text-sm text-dim">The passport appears after this rail is quoted. It is the same document the desk signs.</p>}
          </div>
          <div className="mt-6">
            <h3 className="kicker">Previous executions</h3>
            {!activity.length ? <p className="mt-3 text-sm text-dim">No execution activity for this opportunity.</p> : null}
            <ul>
              {activity.map((row) => (
                <li key={row.id} className="border-t border-line py-2 text-sm">
                  {row.symbol} · {row.status}
                  {row.passportHash ? ` · passport ${row.passportHash.slice(0, 12)}` : ""}
                  {row.txHash ? ` · ${row.txHash}` : row.orderId ? ` · ${row.orderId}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="agent-execution">
          <h2 id="agent-execution" className="kicker">
            Binance Agentic Wallet
          </h2>
          <p className="mt-3 text-sm">
            <StatusChip tone={agent === "CONNECTED" ? "open" : agent === "DISCONNECTED" ? "offline" : "pending"}>{agent}</StatusChip>
          </p>
          <p className="mt-2 text-sm text-dim">BSC mainnet · chain 56 · execution mode Agentic market order when the worker is signed in.</p>
          <p className="num mt-2 text-sm">{agent === "CONNECTED" && agentAddress ? shortAddr(agentAddress) : "Wallet unavailable"}</p>
          {agent !== "CONNECTED" ? (
            <Link href="/wallet" className="mt-3 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
              Connect / sign in
            </Link>
          ) : null}
          <h3 className="kicker mt-8">Parallax agent</h3>
          <p className="mt-3 text-sm">BNB Agent Studio · {studioStatus}</p>
          {studio.live && studio.address ? <p className="num mt-1 text-sm text-dim">{shortAddr(studio.address)}</p> : null}
          <p className="mt-3 text-sm text-dim">Monitor, analyze, compare, and prepare. Execution stays on the Agentic Wallet. Agent analysis never changes your policy or signs on your behalf.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Why is this flagged?", "Compare the wrappers.", "What is the cheapest executable rail?", "What happens if the cash market is closed?"].map((prompt) => (
              <button key={prompt} type="button" className="h-11 border border-line px-3 text-[11px] tracking-[0.08em] text-dim hover:text-gold" onClick={() => queueCopilot(selectedCard ? `${prompt} ${selectedCard.ticker}` : prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <ol className="mt-6 space-y-1 text-[11px] tracking-[0.08em] text-dim">
            <li>RWA reference → {reference == null ? "unavailable" : money(reference)}</li>
            <li>Binance quote → {selectedCard ? `${selectedCard.symbol} ${selectedCard.mode || "—"}` : "—"}</li>
            <li>PolicyEngine → {policy?.verdict || "—"}</li>
            <li>Execution passport → {passport?.state || "—"}</li>
            <li>Agentic Wallet → {agent}</li>
            <li>Execution receipt → {activity[0]?.receiptId || activity[0]?.txHash || "none yet"}</li>
            <li>Agent Studio → {studioStatus}</li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="text-[11px] tracking-[0.14em] text-dim">
      {label}
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-gold">
        {children}
      </select>
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className={`num mt-1 ${warn ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function QueueRow({ row, now, selected, onSelect }: { row: OpportunityQueueRow; now: number; selected: boolean; onSelect: () => void }) {
  const card = row.card;
  const age = quoteAgeLabel(card.quoteExpiresAt ?? null, now);
  const priced = card.perShare > 0 && card.reference > 0;
  return (
    <TR selected={selected}>
      <TD>
        <span className="block">{row.name}</span>
        <span className="num text-dim">{row.ticker}</span>
      </TD>
      <TD numeric>{card.reference > 0 ? money(card.reference) : "—"}</TD>
      <TD numeric>{card.perShare > 0 ? money(card.perShare) : "—"}</TD>
      <TD numeric>{priced ? pct(card.grossPct) : "—"}</TD>
      <TD numeric>{card.complete ? pct(card.slipPct) : "—"}</TD>
      <TD numeric>{money(card.networkFeeUsd)}</TD>
      <TD numeric>{card.gasEstimateUsd == null ? card.estimatedGasUnits || "—" : money(card.gasEstimateUsd)}</TD>
      <TD numeric>{money(card.tradeFeeUsd)}</TD>
      <TD numeric>{priced ? pct(card.netPct) : "—"}</TD>
      <TD>{card.symbol}</TD>
      <TD>
        <StatusChip tone={railTone(card.status)}>{statusWord(card.status)}</StatusChip>
      </TD>
      <TD className={age.stale ? "text-warn" : undefined}>{age.label}</TD>
      <TD>
        <button type="button" className="h-11 text-[11px] tracking-[0.14em] text-gold" onClick={onSelect}>
          Analyze {row.ticker}
        </button>
      </TD>
    </TR>
  );
}
