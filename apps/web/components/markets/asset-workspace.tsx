"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  COPY,
  activityForTicker,
  assetReference,
  cashSession,
  catalogAsset,
  quoteAgeLabel,
  railsFromBooks,
  type MarketStatus,
  type Rail,
} from "@parallax/core";
import { ExecutionPassportPanel } from "@/components/execution-passport";
import { Button } from "@/components/ui/button";
import { StatusChip, railTone } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useParallax } from "@/lib/store";
import { RAIL_LABEL, SESSION_WORD, money, pct, statusWord } from "./format";

const TABS = ["overview", "execution", "reference", "activity"] as const;
type Tab = (typeof TABS)[number];

function asRail(value: string | null): Rail | null {
  if (value === "bStock" || value === "ondo" || value === "xStock") return value;
  return null;
}

function asTab(value: string | null): Tab {
  if (value === "execution" || value === "reference" || value === "activity" || value === "overview") return value;
  return "overview";
}

export function AssetWorkspace({ ticker }: { ticker: string }) {
  const asset = catalogAsset(ticker);
  const router = useRouter();
  const search = useSearchParams();
  const tab = asTab(search.get("tab"));
  const railParam = asRail(search.get("rail"));
  const books = useParallax((s) => s.books);
  const lockedRail = useParallax((s) => s.lockedRail);
  const quoting = useParallax((s) => s.quoting);
  const quoteError = useParallax((s) => s.quoteError);
  const session = useParallax((s) => s.session);
  const priorClose = useParallax((s) => s.priorClose);
  const priorDate = useParallax((s) => s.priorDate);
  const priorOpen = useParallax((s) => s.priorOpen);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayDate = useParallax((s) => s.fridayDate);
  const fridayOpen = useParallax((s) => s.fridayOpen);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const stockReference = useParallax((s) => s.stockReference);
  const tape = useParallax((s) => s.tape);
  const selectTicker = useParallax((s) => s.selectTicker);
  const refreshQuote = useParallax((s) => s.refreshQuote);
  const lockRail = useParallax((s) => s.lockRail);
  const openConfirm = useParallax((s) => s.openConfirm);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!asset) return;
    void selectTicker(asset.ticker, railParam ?? undefined);
    // Quote once per underlying. Rail changes lock the existing book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.ticker]);

  useEffect(() => {
    if (railParam) lockRail(railParam);
  }, [railParam, lockRail]);

  const referencePrice = priorClose ?? fridayClose ?? stockReference ?? null;
  const rails = useMemo(() => railsFromBooks(asset ? books : [], referencePrice), [asset, books, referencePrice]);
  const selected = rails.find((rail) => rail.rail === (lockedRail || railParam)) || rails.find((rail) => rail.status === "OPEN" && rail.perShare != null) || null;
  const cash = session || cashSession();
  const reference = assetReference({
    perShare: selected?.perShare ?? null,
    priorClose,
    priorDate,
    priorOpen,
    fridayClose,
    fridayDate,
    fridayOpen,
    sessionOpen,
    sessionOpenDate,
    rwaReference: stockReference,
  });
  const activity = asset ? activityForTicker(tape, asset.ticker) : [];

  function href(next: { tab?: Tab; rail?: Rail | null }) {
    const params = new URLSearchParams(search.toString());
    params.set("tab", next.tab || tab);
    const rail = next.rail === undefined ? railParam : next.rail;
    if (rail) params.set("rail", rail);
    else params.delete("rail");
    return `/markets/${asset?.ticker || ticker}?${params.toString()}`;
  }

  if (!asset) {
    return (
      <div className="px-4 py-8 md:px-8">
        <p className="kicker">Markets</p>
        <h1 className="display mt-3 text-4xl">{ticker.toUpperCase()}</h1>
        <p className="mt-4 text-sm text-dim">No BSC wrapper for {ticker.toUpperCase()}.</p>
        <Link href="/markets" className="mt-6 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
          Back to markets
        </Link>
      </div>
    );
  }

  const bestGap = selected?.gapPct ?? null;
  const age = quoteAgeLabel(selected?.quoteExpiresAt ?? null, now);

  return (
    <div className="px-4 py-6 md:px-8">
      <p className="kicker">
        <Link href="/markets" className="hover:text-gold">
          Markets
        </Link>
      </p>
      <header className="mt-3 border-b border-line pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display text-5xl">{asset.ticker}</h1>
            <p className="mt-2 text-lg text-dim">{asset.name}</p>
          </div>
          <StatusChip tone={railTone(selected?.status || "UNKNOWN")}>{statusWord((selected?.status || "UNKNOWN") as MarketStatus)}</StatusChip>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat label="Reference price" value={referencePrice == null ? "REFERENCE UNAVAILABLE" : money(referencePrice)} />
          <HeroStat label="Best executable" value={money(selected?.perShare)} />
          <HeroStat label="Gap" value={pct(bestGap)} />
          <HeroStat label="Quote" value={age.stale ? "QUOTE STALE" : age.label} warn={age.stale} />
        </dl>
        <p className="mt-4 text-sm text-dim">
          {SESSION_WORD[cash.kind] || cash.label} · Cash {cash.atmosphere === "open" ? "OPEN" : "CLOSED"} · {cash.chip}
        </p>
        {selected && selected.multiplier !== 1 ? (
          <p className="mt-2 text-sm text-dim">Per-share equivalent includes wrapper multiplier {selected.multiplier}.</p>
        ) : (
          <p className="mt-2 text-sm text-dim">Per-share equivalent is the tokenized price divided by the wrapper multiplier.</p>
        )}
        {age.stale ? (
          <p className="mt-3 text-sm text-warn" role="status">
            QUOTE STALE. That price is 30 seconds old. Requote.
          </p>
        ) : null}
        {quoting ? (
          <p className="mt-3 text-sm text-dim" role="status">
            SCANNING BSC
          </p>
        ) : null}
        {quoteError ? (
          <p className="mt-3 text-sm text-down" role="alert">
            {quoteError}
          </p>
        ) : null}
        {cash.atmosphere === "closed" ? (
          <p className="mt-4 max-w-2xl text-sm text-dim">
            Cash market is closed. BNB wrappers may still have tokenized prints. Executable availability is rail-specific.
          </p>
        ) : null}
        <p className="mt-4 max-w-2xl text-sm text-dim">{COPY.disclaimer}</p>
      </header>

      <div className="mt-6 flex gap-4 overflow-x-auto border-b border-line" role="tablist" aria-label="Asset detail">
        {TABS.map((item) => (
          <Link
            key={item}
            href={href({ tab: item })}
            role="tab"
            aria-selected={tab === item}
            className={`inline-flex h-11 items-center text-[11px] tracking-[0.16em] ${tab === item ? "text-gold" : "text-dim"}`}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </div>

      {tab === "overview" || tab === "execution" ? (
        <section className="mt-6" aria-labelledby="rail-comparison">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="rail-comparison" className="kicker">
              Representations
            </h2>
            <button type="button" className="h-11 text-[11px] tracking-[0.14em] text-dim hover:text-gold" onClick={() => void refreshQuote()}>
              Requote
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Representation</TH>
                  <TH>Symbol</TH>
                  <TH>Status</TH>
                  <TH>Execution</TH>
                  <TH numeric>Per-share</TH>
                  <TH numeric>Gap</TH>
                  <TH numeric>Price impact</TH>
                  <TH numeric>Network fee</TH>
                  <TH numeric>Gas estimate</TH>
                  <TH numeric>Trade fee</TH>
                  <TH>Quote age</TH>
                </TR>
              </THead>
              <TBody>
                {rails.map((rail) => {
                  const railAge = quoteAgeLabel(rail.quoteExpiresAt, now);
                  const selectedRail = lockedRail === rail.rail || railParam === rail.rail;
                  return (
                    <TR key={rail.rail} selected={selectedRail}>
                      <TD>
                        <button
                          type="button"
                          className="inline-flex h-11 items-center text-left"
                          aria-pressed={selectedRail}
                          onClick={() => router.replace(href({ rail: rail.rail }), { scroll: false })}
                        >
                          {RAIL_LABEL[rail.rail]}
                          {selectedRail ? <span className="ml-2 text-[11px] tracking-[0.12em] text-gold">Selected</span> : null}
                        </button>
                      </TD>
                      <TD>{rail.symbol}</TD>
                      <TD>
                        <StatusChip tone={railTone(rail.status)}>{statusWord(rail.status)}</StatusChip>
                        {rail.errorText ? <span className="mt-1 block text-[11px] text-dim">{rail.errorText}</span> : null}
                      </TD>
                      <TD>{rail.mode || "—"}</TD>
                      <TD numeric>{money(rail.perShare)}</TD>
                      <TD numeric>{pct(rail.gapPct)}</TD>
                      <TD numeric>{rail.priceImpactPct == null ? "—" : pct(rail.priceImpactPct)}</TD>
                      <TD numeric>{money(rail.networkFeeUsd)}</TD>
                      <TD numeric>{rail.gasEstimateUsd == null ? (rail.estimatedGasUnits ? `${rail.estimatedGasUnits} units` : "—") : money(rail.gasEstimateUsd)}</TD>
                      <TD numeric>{money(rail.tradeFeeUsd)}</TD>
                      <TD className={railAge.stale ? "text-warn" : undefined}>{railAge.label}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          {!rails.some((rail) => rail.status === "OPEN" && rail.perShare != null) && !quoting ? (
            <p className="mt-4 text-sm text-dim">NO EXECUTABLE QUOTE</p>
          ) : null}
        </section>
      ) : null}

      {tab === "overview" || tab === "reference" ? (
        <section className="mt-8" aria-labelledby="reference-block">
          <h2 id="reference-block" className="kicker">
            Reference
          </h2>
          {!reference.available ? <p className="mt-3 text-sm text-dim">REFERENCE UNAVAILABLE</p> : null}
          <dl className="mt-4 grid gap-4 md:grid-cols-2">
            {reference.prints.map((print) => (
              <div key={print.id} className="border-t border-line py-3">
                <dt className="text-dim">{print.label}</dt>
                <dd className="num mt-1">{print.value == null ? "—" : money(print.value)}</dd>
                <p className="mt-1 text-[11px] text-dim">
                  {print.date || "Date unavailable"} · {print.source}
                </p>
              </div>
            ))}
          </dl>
          <h3 className="kicker mt-6">Gaps versus the selected executable</h3>
          <ul className="mt-3 grid gap-2 text-sm">
            {reference.gaps.map((gap) => (
              <li key={gap.label} className="flex items-center justify-between border-t border-line py-2">
                <span className="text-dim">{gap.label}</span>
                <span className="num">{pct(gap.pct)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "execution" ? (
        <section className="mt-8" aria-labelledby="execution-passport">
          <h2 id="execution-passport" className="kicker">
            Execution
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-dim">
            {selected
              ? `${selected.symbol} on ${RAIL_LABEL[selected.rail]} stays on the existing quote, policy, and passport path.`
              : "Select a rail. Trade still uses the desk confirmation flow."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              tone="primary"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                void selectTicker(asset.ticker, selected.rail).then(() => router.push("/desk"));
              }}
            >
              Open trade desk
            </Button>
            <Button
              type="button"
              disabled={!selected || selected.status !== "OPEN"}
              onClick={() => {
                if (!selected) return;
                const book = books.find((row) => row.wrapper.rail === selected.rail);
                if (book) void openConfirm(book, "buy");
              }}
            >
              Prepare signature
            </Button>
            <a href="#passport-panel" className="inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
              View execution passport
            </a>
          </div>
          <div id="passport-panel" className="mt-6">
            <ExecutionPassportPanel />
          </div>
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="mt-8" aria-labelledby="asset-activity">
          <h2 id="asset-activity" className="kicker">
            Activity
          </h2>
          {!activity.length ? <p className="mt-3 text-sm text-dim">No execution activity for {asset.ticker}.</p> : null}
          <ul className="mt-4">
            {activity.map((row) => (
              <li key={row.id} className="grid gap-1 border-t border-line py-3 text-sm">
                <span>
                  {row.side.toUpperCase()} {row.symbol} · {row.status}
                </span>
                <span className="num text-dim">
                  {row.usd} USDT
                  {row.txHash ? ` · ${row.txHash}` : ""}
                  {row.passportHash ? ` · passport ${row.passportHash.slice(0, 12)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function HeroStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className={`num mt-1 text-lg ${warn ? "text-warn" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
