"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import {
  COPY,
  agenticAvailability,
  buildPortfolio,
  executionsForTickers,
  formatAge,
  formatQty,
  getUnderlying,
  marketHref,
  opportunityHref,
  quoteAgeLabel,
  shortAddr,
  type PortfolioBalanceLine,
  type PortfolioQuote,
} from "@parallax/core";
import { useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { RAIL_LABEL, money, pct } from "@/components/markets/format";

export function PortfolioWorkspace() {
  const mounted = useMounted();
  const { isConnected, address } = useAccount();
  const wallet = useParallax((s) => s.wallet);
  const portfolio = useParallax((s) => s.portfolio);
  const opportunities = useParallax((s) => s.opportunities);
  const scanAt = useParallax((s) => s.scanAt);
  const tape = useParallax((s) => s.tape);
  const passport = useParallax((s) => s.passport);
  const session = useParallax((s) => s.session);
  const refreshDesk = useParallax((s) => s.refreshDesk);
  const queueCopilot = useParallax((s) => s.queueCopilot);
  const [now, setNow] = useState(() => Date.now());
  const [balanceAt, setBalanceAt] = useState<number | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);

  const connected = Boolean(wallet || (mounted && isConnected && address));

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (portfolio) setBalanceAt(Date.now());
  }, [portfolio]);

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

  const lines = useMemo<PortfolioBalanceLine[]>(() => {
    const held: PortfolioBalanceLine[] = (portfolio?.lines || []).map((line) => {
      const underlying = line.ticker ? getUnderlying(line.ticker) : null;
      const multiplier = line.rail && underlying ? underlying.wrappers[line.rail]?.multiplier : null;
      return {
        symbol: line.symbol,
        address: line.address,
        rail: line.rail,
        ticker: line.ticker,
        amount: line.amount,
        multiplier,
      };
    });
    if (portfolio && portfolio.bnb > 0) {
      held.push({ symbol: "BNB", address: "native", amount: portfolio.bnb, multiplier: null });
    }
    return held;
  }, [portfolio]);

  const quotes = useMemo<PortfolioQuote[]>(
    () =>
      opportunities.flatMap((card) => {
        if (card.perShare == null || !(card.perShare > 0)) return [];
        return [
          {
            ticker: card.ticker,
            rail: card.rail,
            symbol: card.symbol,
            perShare: card.perShare,
            reference: card.reference,
            quoteExpiresAt: card.quoteExpiresAt,
          },
        ];
      }),
    [opportunities],
  );

  const names = useMemo(() => {
    const bag: Record<string, string> = {};
    for (const line of lines) {
      if (!line.ticker || bag[line.ticker]) continue;
      bag[line.ticker] = getUnderlying(line.ticker)?.name || line.ticker;
    }
    return bag;
  }, [lines]);

  const view = useMemo(() => buildPortfolio({ connected, lines, names, quotes }), [connected, lines, names, quotes]);
  const executions = executionsForTickers(tape, view.equity.map((row) => row.ticker || "").filter(Boolean));
  const agent = agenticAvailability(agentStatus);

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Portfolio</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">On-chain holdings on BNB Smart Chain.</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">A wrapper is not the underlying security. {COPY.disclaimer}</p>
        {!connected ? (
          <div className="mt-6">
            <p className="text-sm">DISCONNECTED</p>
            <p className="mt-2 max-w-xl text-sm text-dim">Connect your Binance Web3 Wallet to view on-chain holdings.</p>
            <Link href="/wallet" className="mt-4 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
              Connect wallet
            </Link>
          </div>
        ) : (
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="kicker">Wallet</dt>
              <dd className="num mt-1">{wallet || address ? shortAddr(wallet || address || "") : "—"}</dd>
            </div>
            <div>
              <dt className="kicker">Network</dt>
              <dd className="mt-1">BNB Smart Chain</dd>
            </div>
            <div>
              <dt className="kicker">Wallet state</dt>
              <dd className="mt-1">CONNECTED</dd>
            </div>
            <div>
              <dt className="kicker">Agentic Wallet</dt>
              <dd className="mt-1">{agent}{agent === "CONNECTED" && agentAddress ? ` · ${shortAddr(agentAddress)}` : ""}</dd>
            </div>
          </dl>
        )}
        {connected ? (
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <button type="button" className="h-11 text-[11px] tracking-[0.14em] text-gold" onClick={() => void refreshDesk()}>
              Refresh
            </button>
            <p className="text-dim">Balance {balanceAt ? `updated ${formatAge(Math.max(0, now - balanceAt))} ago` : "not loaded"}</p>
            <p className="text-dim">Market scan {scanAt ? `${formatAge(Math.max(0, now - scanAt))} ago` : "unavailable"}</p>
          </div>
        ) : null}
        {portfolio?.walletApiError ? <p className="mt-3 text-sm text-down">Balance read: {portfolio.walletApiError}</p> : null}
      </header>

      {connected ? (
        <>
          <section className="mt-8" aria-labelledby="summary">
            <h2 id="summary" className="kicker">
              Exposure summary
            </h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-dim">Valued tokenized holdings</dt>
                <dd className="num mt-1">{view.valuation.valuedUsd == null ? "—" : money(view.valuation.valuedUsd)}</dd>
                <p className="mt-1 text-[11px] text-dim">{view.valuation.partial ? "PARTIAL. Some balances do not have a live valuation." : "Every detected tokenized holding has a live print."}</p>
              </div>
              <div>
                <dt className="text-dim">Stablecoin balance</dt>
                <dd className="mt-1">{view.stables.length ? view.stables.map((row) => `${formatQty(row.amount)} ${row.symbol}`).join(" · ") : "—"}</dd>
                <p className="mt-1 text-[11px] text-dim">Shown as token amount. Not marked to a market print.</p>
              </div>
              <div>
                <dt className="text-dim">Cost basis / PnL</dt>
                <dd className="mt-1">NOT AVAILABLE</dd>
                <p className="mt-1 text-[11px] text-dim">Execution receipts are recorded for audit. A cost-basis engine is not enabled.</p>
              </div>
            </dl>
          </section>

          <section className="mt-8" aria-labelledby="equity">
            <h2 id="equity" className="kicker">
              Tokenized equity exposure
            </h2>
            {!view.equity.length ? (
              <div className="mt-4">
                <p className="text-sm text-dim">No tokenized-equity holdings detected.</p>
                <Link href="/markets" className="mt-3 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
                  Explore markets
                </Link>
              </div>
            ) : (
              <ul className="mt-4">
                {view.groups.map((group) => (
                  <li key={group.ticker} className="border-t border-line py-4">
                    <p className="text-lg">{group.ticker}</p>
                    <p className="text-sm text-dim">{group.name}</p>
                    <p className="mt-2 text-sm">
                      Combined share equivalent {group.combinedShares == null ? "—" : formatQty(group.combinedShares)} · Value {group.combinedValueUsd == null ? "—" : money(group.combinedValueUsd)}
                    </p>
                    <ul className="mt-3 grid gap-3">
                      {group.rails.map((row) => (
                        <li key={row.address} className="text-sm">
                          <p>
                            {row.symbol} · {row.rail ? RAIL_LABEL[row.rail] : "—"} · {row.status}
                          </p>
                          <p className="text-dim">
                            Balance {formatQty(row.amount)} · multiplier {row.multiplier ?? "—"} · per-share equivalent {row.shareEquivalent == null ? "—" : formatQty(row.shareEquivalent)} · value {row.valueUsd == null ? "—" : money(row.valueUsd)}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-4">
                            <Link href={marketHref(group.ticker)} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">
                              View market
                            </Link>
                            <Link href={opportunityHref(group.ticker)} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">
                              View opportunities
                            </Link>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8" aria-labelledby="other">
            <h2 id="other" className="kicker">
              Other on-chain assets
            </h2>
            <p className="mt-2 text-sm text-dim">These are not classified as tokenized equities. The balance read covers curated wrappers, quote stables, and native BNB.</p>
            {!view.other.length && !view.stables.length ? <p className="mt-3 text-sm text-dim">None detected.</p> : null}
            <ul className="mt-3">
              {[...view.stables, ...view.other].map((row) => (
                <li key={row.address} className="border-t border-line py-3 text-sm">
                  <p>
                    {row.status === "UNKNOWN" ? "UNKNOWN TOKEN" : row.symbol} · {row.status}
                  </p>
                  <p className="text-dim">
                    {formatQty(row.amount)} {row.symbol} · {row.address === "native" ? "Native BNB" : shortAddr(row.address)} · value —
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="watchlist">
            <h2 id="watchlist" className="kicker">
              Holding watchlist
            </h2>
            <p className="mt-2 text-sm text-dim">Market prints are not portfolio cost. Session {session?.label || "—"}.</p>
            {!view.watchlist.length ? <p className="mt-3 text-sm text-dim">Quote unavailable for these holdings.</p> : null}
            <ul className="mt-3">
              {view.watchlist.map((row) => {
                const age = quoteAgeLabel(row.quoteExpiresAt, now);
                return (
                  <li key={row.address} className="border-t border-line py-3 text-sm">
                    <p>
                      {row.ticker} · {row.symbol} · MARKET PRINT
                    </p>
                    <p className="text-dim">
                      Tokenized {money(row.perShare)} · Reference {row.reference == null ? "—" : money(row.reference)} · Gap {pct(row.gapPct)} · Quote {age.stale ? "QUOTE STALE" : age.label}
                    </p>
                    <Link href={opportunityHref(row.ticker || "")} className="inline-flex h-11 items-center text-[11px] tracking-[0.14em] text-gold">
                      View opportunity
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="executions">
            <h2 id="executions" className="kicker">
              Recent executions
            </h2>
            <p className="mt-2 text-sm text-dim">Desk tape rows for held tickers. Each row does not store the wallet address, so this is not a wallet-filtered ledger.</p>
            {!executions.length ? <p className="mt-3 text-sm text-dim">No execution activity for these holdings.</p> : null}
            <ul>
              {executions.map((row) => (
                <li key={row.id} className="border-t border-line py-3 text-sm">
                  <p>
                    {row.side.toUpperCase()} {row.ticker} · {row.symbol} · {row.status}
                  </p>
                  <p className="text-dim">
                    {row.usd} USDT · {row.txHash || row.orderId || "no transaction id"}
                    {row.passportHash ? ` · passport ${row.passportHash.slice(0, 12)}` : ""}
                  </p>
                  {row.passportHash && passport?.hash === row.passportHash ? <p className="text-dim">This hash matches the active desk passport.</p> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8 border-t border-line pt-6">
            <h2 className="kicker">Ask about these holdings</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {["Explain my tokenized equity exposure.", "Which underlying has the largest exposure?", "Compare my NVDA representations.", "What tokenized positions do I hold?", "What opportunities relate to my holdings?"].map((prompt) => (
                <button key={prompt} type="button" className="h-11 border border-line px-3 text-left text-[11px] tracking-[0.06em] text-dim hover:text-gold" onClick={() => queueCopilot(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
