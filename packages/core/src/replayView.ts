import { DEMO_SCENARIOS, evaluateLimits, type DemoScenario, type DemoScenarioId, type RiskLimits } from "./flag";

export type ReplayBeat = "market" | "opportunity" | "compare" | "policy" | "passport" | "sign" | "execute" | "receipt";

export interface ReplayFrame {
  beat: ReplayBeat;
  title: string;
  state: "shown" | "wait" | "stop" | "blocked";
  detail: string;
}

export interface ReplayScript {
  id: DemoScenarioId;
  ticker: string;
  policyPass: boolean;
  reasons: string[];
  frames: ReplayFrame[];
  boundary: string;
}

export function replayScenario(id: DemoScenarioId): DemoScenario {
  const found = DEMO_SCENARIOS.find((row) => row.id === id);
  if (!found) throw new Error(`Unknown replay scenario ${id}`);
  return found;
}

export function replayScript(scenario: DemoScenario, limits: RiskLimits): ReplayScript {
  const gate = evaluateLimits(scenario.card, limits, 10);
  const frames: ReplayFrame[] = [
    {
      beat: "market",
      title: "MARKET",
      state: "shown",
      detail: scenario.cashOpen ? "Cash session is open in this scenario." : "Cash session is closed. The tokenized print is separate from the reference.",
    },
    {
      beat: "opportunity",
      title: "OPPORTUNITY",
      state: "shown",
      detail: `${scenario.card.symbol} is ${scenario.card.grossPct}% from the scenario reference. This is not an arbitrage guarantee.`,
    },
    {
      beat: "compare",
      title: "COMPARE",
      state: "shown",
      detail: scenario.wrappers.map((row) => `${row.symbol} ${row.perShare}`).join(" · "),
    },
    {
      beat: "policy",
      title: "POLICY",
      state: gate.pass ? "shown" : "blocked",
      detail: gate.pass ? "Configured constraints are satisfied." : gate.fails.join(" "),
    },
  ];
  if (gate.pass && scenario.id === "sim-ok") {
    frames.push(
      { beat: "passport", title: "PASSPORT", state: "shown", detail: "Execution context is prepared from the scenario card. No passport was written to the desk." },
      { beat: "sign", title: "SIGN", state: "wait", detail: "SIMULATED. READY FOR SIGNATURE." },
    );
  } else if (gate.pass && scenario.id === "agent-watch") {
    frames.push(
      { beat: "passport", title: "PASSPORT", state: "shown", detail: "The scenario illustrates an agent path. No agent order was sent." },
      { beat: "execute", title: "EXECUTE", state: "stop", detail: "WOULD HAND OFF TO AGENTIC WALLET. Replay does not submit." },
      { beat: "receipt", title: "RECEIPT", state: "stop", detail: "No receipt. A scenario path is not an execution." },
    );
  } else if (gate.pass) {
    frames.push(
      { beat: "passport", title: "PASSPORT", state: "shown", detail: "Execution context is prepared from the scenario card. No passport was written to the desk." },
      { beat: "sign", title: "SIGN", state: "wait", detail: "READY FOR SIGNATURE." },
    );
  }
  return {
    id: scenario.id,
    ticker: scenario.card.ticker,
    policyPass: gate.pass,
    reasons: gate.fails,
    frames,
    boundary: "REPLAY COMPLETE — NO LIVE TRANSACTION",
  };
}

export function visibleFrames(script: ReplayScript, step: number): ReplayFrame[] {
  const index = Math.max(0, Math.min(step, script.frames.length));
  return script.frames.slice(0, index);
}

export function replayComplete(script: ReplayScript, step: number): boolean {
  return step >= script.frames.length;
}
