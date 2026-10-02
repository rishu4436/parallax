"use client";

import Link from "next/link";
import { formatPx, gapPct, marketCatalog } from "@parallax/core";
import { ExecutionSpine } from "@/components/shell/execution-spine";
import { useParallax } from "@/lib/store";

export function Landing() {
  const session = useParallax((s) => s.session);
  const ticker = useParallax((s) => s.ticker);
  const best = useParallax((s) => s.best);
  const opportunities = useParallax((s) => s.opportunities);
  const scanning = useParallax((s) => s.scanning);
  const tape = useParallax((s) => s.tape);
  const passport = useParallax((s) => s.passport);
  const quote = best?.best;
  const reference = quote?.ok
    ? opportunities.find((card) => card.symbol === best?.wrapper.symbol && card.reference != null && card.reference > 0)?.reference
    : null;
  const gap = quote?.ok && reference != null && reference > 0 ? gapPct(quote.perShare, reference) : null;
  const openRails = new Set(opportunities.filter((card) => card.status === "OPEN").map((card) => `${card.ticker}:${card.rail}`)).size;
  const tracked = new Set(opportunities.map((card) => card.ticker)).size;
  const catalog = marketCatalog().length;
  const cash = session?.atmosphere === "open" ? "OPEN" : session ? "CLOSED" : "—";

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <p className="kicker">Parallax</p>
      <h1 className="display mt-4 max-w-3xl text-5xl leading-[1.05] md:text-6xl">Execution intelligence for tokenized equities on BNB Smart Chain.</h1>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-dim">
        Discover markets, assess executable opportunity, enforce policy, and move from quote to signed execution with a complete audit trail.
      </p>
      <div className="mt-8 flex flex-wrap gap-6">
        <Link href="/markets" className="btn btn-primary h-11 px-5">Open Markets</Link>
        <Link href="/opportunities" className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">View Opportunities</Link>
      </div>

      <section className="mt-12" aria-labelledby="market-state">
        <h2 id="market-state" className="kicker">Market state</h2>
        <dl className="mt-4 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div><dt className="text-dim">Cash session</dt><dd className="mt-1">{cash}</dd></div>
          <div><dt className="text-dim">BSC rails</dt><dd className="mt-1">{scanning && !opportunities.length ? "SCANNING" : opportunities.length ? "QUOTED" : "—"}</dd></div>
          <div><dt className="text-dim">Tracked names</dt><dd className="num mt-1">{opportunities.length ? `${tracked} of ${catalog}` : "—"}</dd></div>
          <div><dt className="text-dim">Executable rails</dt><dd className="num mt-1">{opportunities.length ? String(openRails) : "—"}</dd></div>
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="spine">
        <h2 id="spine" className="kicker">Execution flow</h2>
        <div className="mt-4">
          <ExecutionSpine
            stages={[
              { label: "MARKET", value: quote?.ok ? "OPEN" : scanning ? "SCANNING" : "—" },
              { label: "OPPORTUNITY", value: opportunities.some((card) => card.status === "OPEN" && card.perShare != null && card.perShare > 0) ? "FOUND" : opportunities.length ? "NONE OPEN" : "—" },
              { label: "POLICY", value: passport?.gate?.verdict || "—" },
              { label: "PASSPORT", value: passport?.state?.toUpperCase() || "—" },
              { label: "SIGN", value: passport?.state === "ready" ? "WAITING" : "—" },
              { label: "RECEIPT", value: tape[0]?.status?.toUpperCase() || "—" },
            ]}
          />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="current">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="current" className="kicker">Current quote · {ticker}</h2>
          <Link href="/desk" className="text-[11px] tracking-[0.14em] text-gold">Open execution</Link>
        </div>
        {quote?.ok ? (
          <dl className="mt-4 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
            <div><dt className="text-dim">Rail</dt><dd className="mt-1">{best?.wrapper.symbol} · {quote.executionMode || "—"}</dd></div>
            <div><dt className="text-dim">Tokenized print</dt><dd className="num mt-1">{formatPx(quote.perShare)}</dd></div>
            <div><dt className="text-dim">Reference</dt><dd className="num mt-1">{reference ? formatPx(reference) : "—"}</dd></div>
            <div><dt className="text-dim">Gap</dt><dd className="num mt-1">{gap == null ? "—" : `${gap.toFixed(2)}%`}</dd></div>
          </dl>
        ) : (
          <p className="mt-4 border-t border-line pt-4 text-sm text-dim">No executable quote is loaded for {ticker}.</p>
        )}
      </section>

      <section className="mt-10" aria-labelledby="does">
        <h2 id="does" className="kicker">What Parallax does</h2>
        <ol className="mt-4 border-t border-line text-sm">
          {[
            ["01", "Discover", "Monitor tokenized equity markets across rails."],
            ["02", "Assess", "Compare reference prices, executable quotes, fees, liquidity, and price impact."],
            ["03", "Control", "Evaluate the opportunity against policy before execution."],
            ["04", "Execute", "Prepare a Passport and bind the execution commitment before an authorized signer submits the trade."],
            ["05", "Audit", "Persist receipts and activity so the decision path can be inspected later."],
          ].map(([n, title, copy]) => (
            <li key={n} className="grid gap-2 border-b border-line py-3 sm:grid-cols-[3rem_8rem_1fr]">
              <span className="num text-dim">{n}</span>
              <span>{title}</span>
              <span className="text-dim">{copy}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="control">
        <h2 id="control" className="kicker">Execution control</h2>
        <dl className="mt-4 border-t border-line text-sm">
          {[
            ["PolicyEngine", "Deterministic policy gate."],
            ["Execution Passport", "Shared execution context."],
            ["Signing Commitment", "Bound transaction or RFQ intent."],
            ["Agentic Wallet", "Authorized execution layer."],
            ["Activity / Receipt", "Auditable execution history."],
          ].map(([name, copy]) => (
            <div key={name} className="grid gap-1 border-b border-line py-3 sm:grid-cols-[14rem_1fr]">
              <dt>{name}</dt>
              <dd className="text-dim">{copy}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="recent">
        <div className="flex items-baseline justify-between">
          <h2 id="recent" className="kicker">Recent activity</h2>
          <Link href="/activity" className="text-[11px] tracking-[0.14em] text-gold">View activity</Link>
        </div>
        {!tape.length ? <p className="mt-4 border-t border-line pt-4 text-sm text-dim">No executions recorded yet.</p> : null}
        <ul>
          {tape.slice(0, 4).map((row) => (
            <li key={row.id} className="border-t border-line py-3 text-sm">
              {row.side.toUpperCase()} {row.ticker} · {row.symbol} · {row.status}
            </li>
          ))}
        </ul>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] tracking-[0.14em] text-dim">
          <Link href="/strategies" className="hover:text-gold">Manage strategies</Link>
          <Link href="/agents" className="hover:text-gold">Open agents</Link>
          <Link href="/developer" className="hover:text-gold">Developer diagnostics</Link>
        </p>
        <p className="mt-8 border-t border-line pt-4 text-xs text-dim">Not advice. Tokens are not shares. No voting. Dividends rebase.</p>
      </section>
    </div>
  );
}
