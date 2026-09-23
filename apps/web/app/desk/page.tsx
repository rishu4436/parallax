"use client";

import { BuildPanel } from "@/components/build-panel";
import { ConfirmTakeover } from "@/components/confirm-takeover";
import { Hero } from "@/components/hero";
import { PortfolioDock } from "@/components/portfolio-dock";
import { SettingsSheet } from "@/components/settings-sheet";
import { StrategiesDock } from "@/components/strategies-dock";
import { Tape } from "@/components/tape";
import { TopBar } from "@/components/top-bar";
import { VenueStack } from "@/components/venue-stack";
import { useMemo } from "react";
import { cashSession, deskSignals, strategyPlan } from "@parallax/core";
import { useParallax } from "@/lib/store";

export default function DeskPage() {
  const view = useParallax((s) => s.view);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-bg/80 text-ink">
      <TopBar />
      <MobileTabs />
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "trade" ? (
          <div className="grid min-h-full grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)] max-[900px]:grid-cols-1">
            <section className="flex min-h-0 flex-col gap-4 border-r border-line px-6 py-6 md:px-8 max-[900px]:border-r-0">
              <Hero />
              <VenueStack />
            </section>
            <TradeAside />
          </div>
        ) : null}
        {view === "jobs" ? (
          <>
            <BuildPanel />
            <StrategiesDock />
          </>
        ) : null}
        {view === "wallet" ? (
          <div className="grid min-h-full grid-cols-[minmax(260px,0.7fr)_minmax(0,1.3fr)] max-[900px]:grid-cols-1">
            <div className="border-r border-line px-6 py-6 md:px-8 max-[900px]:border-r-0">
              <PortfolioDock />
            </div>
            <Tape />
          </div>
        ) : null}
      </div>
      <SettingsSheet />
      <ConfirmTakeover />
    </main>
  );
}

function MobileTabs() {
  const view = useParallax((s) => s.view);
  const setView = useParallax((s) => s.setView);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  return (
    <nav className="flex border-b border-line sm:hidden" aria-label="Desk">
      {(
        [
          ["trade", "Trade"],
          ["jobs", "Jobs"],
          ["wallet", "Wallet"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          className={`h-11 flex-1 text-[11px] tracking-[0.16em] ${view === id ? "text-gold" : "text-dim"}`}
          onClick={() => setView(id)}
        >
          {label}
        </button>
      ))}
      <button className="h-11 flex-1 text-[11px] tracking-[0.16em] text-dim" onClick={() => setSettingsOpen(true)}>
        Settings
      </button>
    </nav>
  );
}

function PlanCard() {
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const jobs = useParallax((s) => s.jobs);
  const settings = useParallax((s) => s.settings);
  const spentToday = useParallax((s) => s.spentToday);
  const fridayClose = useParallax((s) => s.fridayClose);
  const fridayOpen = useParallax((s) => s.fridayOpen);
  const fridayDate = useParallax((s) => s.fridayDate);
  const priorClose = useParallax((s) => s.priorClose);
  const priorOpen = useParallax((s) => s.priorOpen);
  const priorDate = useParallax((s) => s.priorDate);
  const sessionOpen = useParallax((s) => s.sessionOpen);
  const sessionOpenDate = useParallax((s) => s.sessionOpenDate);
  const plan = useMemo(() => {
    if (!books.length) return null;
    return strategyPlan({
      signals: deskSignals({
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
      }),
      jobs,
      orderCapUsdt: settings?.orderCapUsdt,
      dailyCapUsdt: settings?.dailyCapUsdt,
      spentToday,
    });
  }, [books, fridayClose, fridayDate, fridayOpen, jobs, priorClose, priorDate, priorOpen, sessionOpen, sessionOpenDate, settings, spentToday, ticker]);
  if (!plan) return null;
  return (
    <section>
      <h2 className="kicker">Plan</h2>
      <p className="mt-3 text-sm">{plan.headline}</p>
      <ol className="mt-3 space-y-2">
        {plan.steps.map((step) => (
          <li key={`${step.title}-${step.detail}`} className="text-sm">
            <span className={step.state === "now" ? "text-gold" : step.state === "blocked" ? "text-down" : "text-dim"}>
              {step.state === "now" ? "Now" : step.state === "blocked" ? "Blocked" : "Later"}
            </span>
            <span className="text-ink"> · {step.title}</span>
            <span className="mt-1 block text-xs text-dim">{step.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TradeAside() {
  const queue = useParallax((s) => s.queue);
  const jobs = useParallax((s) => s.jobs);
  const beat = useParallax((s) => s.beat);
  const signQueued = useParallax((s) => s.signQueued);
  const setView = useParallax((s) => s.setView);
  const armed = jobs.filter((job) => !job.paused);

  return (
    <aside className="flex flex-col gap-6 px-6 py-6 md:px-7">
      <PlanCard />
      <section>
        <h2 className="kicker">To sign</h2>
        {queue.length ? (
          <ul className="mt-3 space-y-2">
            {queue.map((item) => (
              <li key={item.id} className="border border-gold/50 px-3 py-3">
                <p className="text-sm text-gold">
                  {item.side} {item.usdt} USDT {item.ticker}
                  {item.railLock ? ` · ${item.railLock}` : ""}
                </p>
                <p className="mt-1 text-xs text-dim">{item.reason}</p>
                <button className="mt-3 h-9 w-full bg-gold text-[11px] tracking-[0.16em] text-bg" onClick={() => void signQueued(item)}>
                  SIGN
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-dim">Nothing is waiting for your wallet. Buy and sell here, or arm a job and the worker will queue one.</p>
        )}
      </section>
      <section>
        <div className="flex items-center justify-between">
          <h2 className="kicker">Armed jobs</h2>
          <button className="text-[11px] tracking-[0.16em] text-gold" onClick={() => setView("jobs")}>
            Manage
          </button>
        </div>
        {armed.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {armed.map((job) => (
              <li key={job.id}>
                <p>{job.name}</p>
                <p className="text-xs text-dim">{job.lastAction || job.cadence}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-dim">No job is armed. Manage opens the full list.</p>
        )}
        <p className="mt-3 text-xs text-dim">Desk worker {beat?.status === "live" ? "is running" : "is stopped"}. A stopped worker does not queue signatures.</p>
      </section>
    </aside>
  );
}
