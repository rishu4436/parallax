"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  COPY,
  cashSession,
  featuredMarkets,
  marketCatalog,
  marketViews,
  queryMarkets,
  quoteAgeLabel,
  type MarketRailFilter,
  type MarketRelevance,
  type MarketSort,
  type MarketStatusFilter,
} from "@parallax/core";
import { StatusChip, railTone } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useParallax } from "@/lib/store";
import { RAIL_LABEL, SESSION_WORD, money, pct, statusWord } from "./format";

export function MarketsDirectory() {
  const opportunities = useParallax((s) => s.opportunities);
  const scanning = useParallax((s) => s.scanning);
  const scanError = useParallax((s) => s.scanError);
  const session = useParallax((s) => s.session);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MarketStatusFilter>("all");
  const [rail, setRail] = useState<MarketRailFilter>("all");
  const [relevance, setRelevance] = useState<MarketRelevance>("all");
  const [sort, setSort] = useState<MarketSort>("alpha");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const catalog = useMemo(() => marketCatalog(), []);
  const views = useMemo(() => marketViews(catalog, opportunities), [catalog, opportunities]);
  const featured = useMemo(() => featuredMarkets(views, 3), [views]);
  const rows = useMemo(
    () => queryMarkets(views, { search, status, rail, relevance, sort, now }),
    [views, search, status, rail, relevance, sort, now],
  );
  const cash = session || cashSession();
  const sessionWord = SESSION_WORD[cash.kind] || cash.label;

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Markets</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Tokenized equity rails on BNB Chain</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">{COPY.disclaimer}</p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="kicker">Session</dt>
            <dd className="mt-1">{sessionWord}</dd>
          </div>
          <div>
            <dt className="kicker">Cash</dt>
            <dd className="mt-1">{cash.atmosphere === "open" ? "OPEN" : "CLOSED"}</dd>
          </div>
          <div>
            <dt className="kicker">BSC</dt>
            <dd className="mt-1">Chain 56 · quotes from Binance</dd>
          </div>
        </dl>
        {cash.atmosphere === "closed" ? (
          <p className="mt-4 max-w-2xl text-sm text-dim">
            Cash market is closed. BNB wrappers may still have tokenized prints. Executable availability is rail-specific.
          </p>
        ) : null}
      </header>

      <section className="mt-8" aria-labelledby="featured-markets">
        <h2 id="featured-markets" className="kicker">
          Featured
        </h2>
        {scanning && !opportunities.length ? <p className="mt-3 text-sm text-dim">SCANNING BSC</p> : null}
        {!scanning && !featured.length ? <p className="mt-3 text-sm text-dim">NO EXECUTABLE QUOTE</p> : null}
        <ul className="mt-4 grid gap-px bg-line md:grid-cols-3">
          {featured.map((asset) => {
            const age = quoteAgeLabel(asset.quoteExpiresAt, now);
            return (
              <li key={asset.ticker} className="bg-bg px-4 py-4">
                <p className="kicker">{asset.ticker}</p>
                <h3 className="mt-2 text-lg">{asset.name}</h3>
                <p className="mt-3 text-sm">
                  {asset.best ? `${asset.best.symbol} · ${RAIL_LABEL[asset.best.rail]}` : "No executable rail"}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-dim">Tokenized price</dt>
                    <dd className="num">{money(asset.best?.perShare)}</dd>
                  </div>
                  <div>
                    <dt className="text-dim">Reference</dt>
                    <dd className="num">{asset.reference == null ? "REFERENCE UNAVAILABLE" : money(asset.reference)}</dd>
                  </div>
                  <div>
                    <dt className="text-dim">Gap</dt>
                    <dd className="num">{pct(asset.gapPct)}</dd>
                  </div>
                  <div>
                    <dt className="text-dim">Quote</dt>
                    <dd className={age.stale ? "text-warn" : "num"}>{age.label}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <StatusChip tone={railTone(asset.status)}>{statusWord(asset.status)}</StatusChip>
                  <Link href={`/markets/${asset.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
                    View {asset.ticker}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="market-universe">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="market-universe" className="kicker">
            Universe
          </h2>
          {scanning ? (
            <p className="text-[11px] tracking-[0.14em] text-dim" role="status">
              SCANNING BSC
            </p>
          ) : null}
        </div>
        {scanError ? (
          <p className="mt-3 text-sm text-down" role="alert">
            {scanError}
          </p>
        ) : null}
        <form className="mt-4 grid gap-3 md:grid-cols-5" onSubmit={(event) => event.preventDefault()}>
          <label className="text-[11px] tracking-[0.14em] text-dim">
            Search
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ticker, company, or symbol"
              className="mt-1 h-11 w-full border border-line bg-transparent px-3 text-sm text-ink outline-none focus:border-gold"
              aria-label="Search ticker, company, or wrapper symbol"
            />
          </label>
          <Filter label="Status" value={status} onChange={(value) => setStatus(value as MarketStatusFilter)}>
            <option value="all">All</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="HALTED">Halted</option>
            <option value="OFFLINE">Offline</option>
          </Filter>
          <Filter label="Rail" value={rail} onChange={(value) => setRail(value as MarketRailFilter)}>
            <option value="all">All</option>
            <option value="bStock">bStocks</option>
            <option value="ondo">Ondo</option>
            <option value="xStock">xStocks</option>
          </Filter>
          <Filter label="Session relevance" value={relevance} onChange={(value) => setRelevance(value as MarketRelevance)}>
            <option value="all">All</option>
            <option value="executable">Executable now</option>
            <option value="none">No executable rail</option>
          </Filter>
          <Filter label="Sort" value={sort} onChange={(value) => setSort(value as MarketSort)}>
            <option value="alpha">Alphabetical</option>
            <option value="gap">Best executable gap</option>
            <option value="price">Best executable price</option>
            <option value="availability">Availability</option>
          </Filter>
        </form>

        {!rows.length ? <p className="mt-6 text-sm text-dim">No names match this filter.</p> : null}

        <div className="mt-4 hidden desk:block">
          <Table>
            <THead>
              <TR>
                <TH>Asset</TH>
                <TH>Best rail</TH>
                <TH numeric>Token price</TH>
                <TH numeric>Reference</TH>
                <TH numeric>Gap</TH>
                <TH numeric>Liquidity</TH>
                <TH>Session</TH>
                <TH>Status</TH>
                <TH>Quote age</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((asset) => (
                <MarketTableRow key={`${asset.ticker}-${rail}`} asset={asset} now={now} sessionWord={sessionWord} />
              ))}
            </TBody>
          </Table>
        </div>

        <ul className="mt-4 grid gap-4 desk:hidden">
          {rows.map((asset) => (
            <MarketStack key={`${asset.ticker}-${rail}`} asset={asset} now={now} sessionWord={sessionWord} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="text-[11px] tracking-[0.14em] text-dim">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-11 w-full border border-line bg-bg px-3 text-sm text-ink outline-none focus:border-gold"
        aria-label={label}
      >
        {children}
      </select>
    </label>
  );
}

function MarketTableRow({
  asset,
  now,
  sessionWord,
}: {
  asset: ReturnType<typeof queryMarkets>[number];
  now: number;
  sessionWord: string;
}) {
  const age = quoteAgeLabel(asset.quoteExpiresAt, now);
  return (
    <>
    <TR>
      <TD>
        <span className="block text-ink">{asset.name}</span>
        <span className="num text-dim">{asset.ticker}</span>
      </TD>
      <TD>{asset.best ? `${asset.best.symbol} · ${RAIL_LABEL[asset.best.rail]}` : "—"}</TD>
      <TD numeric>{money(asset.best?.perShare)}</TD>
      <TD numeric>{asset.reference == null ? "—" : money(asset.reference)}</TD>
      <TD numeric>{pct(asset.gapPct)}</TD>
      <TD numeric>{asset.liquidity == null ? "—" : asset.liquidity.toLocaleString("en-US")}</TD>
      <TD>{sessionWord}</TD>
      <TD>
        <StatusChip tone={railTone(asset.status)}>{statusWord(asset.status)}</StatusChip>
        {age.stale ? <span className="ml-2 text-[11px] text-warn">QUOTE STALE</span> : null}
      </TD>
      <TD>{age.label}</TD>
      <TD>
        <Link href={`/markets/${asset.ticker}`} className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
          View {asset.ticker}
        </Link>
      </TD>
    </TR>
    <TR>
      <TD colSpan={10}>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-dim" aria-label={`${asset.ticker} rails`}>
          {asset.rails.map((item) => (
            <li key={item.rail}>
              {RAIL_LABEL[item.rail]} {item.symbol} · {statusWord(item.status)} · {item.mode || "—"} · {money(item.perShare)} · {quoteAgeLabel(item.quoteExpiresAt, now).label}
            </li>
          ))}
        </ul>
      </TD>
    </TR>
    </>
  );
}

function MarketStack({
  asset,
  now,
  sessionWord,
}: {
  asset: ReturnType<typeof queryMarkets>[number];
  now: number;
  sessionWord: string;
}) {
  const age = quoteAgeLabel(asset.quoteExpiresAt, now);
  return (
    <li className="border border-line px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-ink">{asset.name}</p>
          <p className="num text-dim">{asset.ticker}</p>
        </div>
        <StatusChip tone={railTone(asset.status)}>{statusWord(asset.status)}</StatusChip>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-dim">Best rail</dt>
          <dd>{asset.best ? `${asset.best.symbol} · ${RAIL_LABEL[asset.best.rail]}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-dim">Token price</dt>
          <dd className="num">{money(asset.best?.perShare)}</dd>
        </div>
        <div>
          <dt className="text-dim">Reference</dt>
          <dd className="num">{asset.reference == null ? "REFERENCE UNAVAILABLE" : money(asset.reference)}</dd>
        </div>
        <div>
          <dt className="text-dim">Gap</dt>
          <dd className="num">{pct(asset.gapPct)}</dd>
        </div>
        <div>
          <dt className="text-dim">Session</dt>
          <dd>{sessionWord}</dd>
        </div>
        <div>
          <dt className="text-dim">Quote age</dt>
          <dd className={age.stale ? "text-warn" : "num"}>
            {age.label}
            {age.stale ? " · That price is 30 seconds old. Requote." : ""}
          </dd>
        </div>
      </dl>
      <ul className="mt-4 grid gap-2 text-xs text-dim">
        {asset.rails.map((item) => (
          <li key={item.rail} className="flex items-center justify-between gap-3 border-t border-line py-2">
            <span>
              {RAIL_LABEL[item.rail]} · {item.symbol}
            </span>
            <span className="num">
              {statusWord(item.status)} · {item.mode || "—"} · {money(item.perShare)}
            </span>
          </li>
        ))}
      </ul>
      <Link href={`/markets/${asset.ticker}`} className="mt-2 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
        View {asset.ticker}
      </Link>
    </li>
  );
}
