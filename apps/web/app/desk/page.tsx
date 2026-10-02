"use client";

import { AgentExecutionLog, StrategyArm } from "@/components/agent-panel";
import { Comparison } from "@/components/comparison";
import { OpportunityBoard } from "@/components/opportunity-board";
import { Hero } from "@/components/hero";
import { OpportunityEngine } from "@/components/opportunity-engine";
import { RiskControls } from "@/components/risk-controls";
import { SessionStrip } from "@/components/session-strip";
import { ExecutionPassportPanel } from "@/components/execution-passport";
import { TradeTicket } from "@/components/trade-ticket";
import { VenueStack } from "@/components/venue-stack";
import { WhyFlagged } from "@/components/why-flagged";
import { useParallax } from "@/lib/store";

export default function DeskPage() {
  const analyzeOpen = useParallax((s) => s.analyzeOpen);

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1.4fr)_minmax(280px,0.7fr)] max-[900px]:grid-cols-1">
      <section className="flex min-h-0 flex-col gap-4 border-r border-line px-6 py-6 md:px-8 max-[900px]:border-r-0">
        <SessionStrip />
        <OpportunityBoard />
        <WhyFlagged />
        <Hero />
        {analyzeOpen ? <Comparison /> : null}
        <TradeTicket />
        <ExecutionPassportPanel />
        <VenueStack />
      </section>
      <TradeAside />
    </div>
  );
}

function TradeAside() {
  const fills = useParallax((s) => s.fills);
  const beat = useParallax((s) => s.beat);

  return (
    <aside className="flex flex-col gap-6 px-6 py-6 md:px-7">
      <OpportunityEngine />
      <RiskControls />
      <AgentExecutionLog initial={fills} />
      <section>
        <h2 className="kicker">Armed jobs</h2>
        <p className="mt-3 text-xs text-dim">
          Desk worker {beat?.status === "live" ? "is running" : "is stopped"}. Armed strategies broadcast from the Agentic Wallet on this machine.
        </p>
        <StrategyArm />
      </section>
    </aside>
  );
}
