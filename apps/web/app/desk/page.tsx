"use client";

import { AgentExecutionLog, StrategyArm } from "@/components/agent-panel";
import { ConfirmTakeover } from "@/components/confirm-takeover";
import { StrategiesDock } from "@/components/strategies-dock";
import { Hero } from "@/components/hero";
import { PortfolioDock } from "@/components/portfolio-dock";
import { SettingsSheet } from "@/components/settings-sheet";
import { Tape } from "@/components/tape";
import { TopBar } from "@/components/top-bar";
import { VenueStack } from "@/components/venue-stack";
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
        {view === "jobs" ? <StrategiesDock /> : null}
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

function TradeAside() {
  const fills = useParallax((s) => s.fills);
  const beat = useParallax((s) => s.beat);

  return (
    <aside className="flex flex-col gap-6 px-6 py-6 md:px-7">
      <AgentExecutionLog initial={fills} />
      <section>
        <h2 className="kicker">Armed jobs</h2>
        <p className="mt-3 text-xs text-dim">Desk worker {beat?.status === "live" ? "is running" : "is stopped"}. Armed strategies broadcast from the Agentic Wallet on this machine.</p>
        <StrategyArm />
      </section>
    </aside>
  );
}
