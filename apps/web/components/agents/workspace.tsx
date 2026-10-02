"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AGENT_CAN,
  AGENT_CANNOT,
  BNB_STACK,
  COPY,
  MCP_TOOLS,
  agentReceipts,
  agenticAvailability,
  describeFill,
  partitionActivity,
  shortAddr,
  strategyRows,
  studioDeskStatus,
  workerPhase,
  type ExecutionPassport,
} from "@parallax/core";
import { AgentExecutionLog, StrategyArm } from "@/components/agent-panel";
import { ExecutionPassportPanel } from "@/components/execution-passport";
import { StatusChip } from "@/components/ui/status";
import { useParallax } from "@/lib/store";

export function AgentsWorkspace() {
  const beat = useParallax((s) => s.beat);
  const studio = useParallax((s) => s.studio);
  const session = useParallax((s) => s.session);
  const armed = useParallax((s) => s.armed);
  const jobs = useParallax((s) => s.jobs);
  const fills = useParallax((s) => s.fills);
  const tape = useParallax((s) => s.tape);
  const activity = useParallax((s) => s.activity);
  const settings = useParallax((s) => s.settings);
  const spentToday = useParallax((s) => s.spentToday);
  const demo = useParallax((s) => s.demo);
  const passport = useParallax((s) => s.passport);
  const queueCopilot = useParallax((s) => s.queueCopilot);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [storedPassport, setStoredPassport] = useState<ExecutionPassport | null>(null);

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

  const latestPassportHash = fills.find((row) => row.passportHash)?.passportHash;
  useEffect(() => {
    if (!latestPassportHash) {
      setStoredPassport(null);
      return;
    }
    let cancel = false;
    void fetch(`/api/passport?hash=${encodeURIComponent(latestPassportHash)}`)
      .then((res) => res.json())
      .then((body: { ok?: boolean; passport?: ExecutionPassport }) => {
        if (!cancel) setStoredPassport(body.ok && body.passport ? body.passport : null);
      })
      .catch(() => {
        if (!cancel) setStoredPassport(null);
      });
    return () => {
      cancel = true;
    };
  }, [latestPassportHash]);

  const wallet = agenticAvailability(agentStatus);
  const studioStatus = studioDeskStatus({ deskKnown: session != null || beat != null, live: Boolean(studio.live) });
  const worker = workerPhase({
    beat: beat?.status ?? null,
    armedUnpaused: armed.filter((row) => !row.paused).length + jobs.filter((row) => !row.paused).length,
  });
  const strategies = strategyRows(armed, jobs);
  const receipts = agentReceipts(fills, tape);
  const liveFills = partitionActivity(fills.map(describeFill)).live;
  const demoActivity = partitionActivity(activity).demo;
  const shownPassport = storedPassport || (passport?.body.intent.actor === "agent" ? passport : null);

  return (
    <div className="px-4 py-6 md:px-8">
      <header className="border-b border-line pb-6">
        <p className="kicker">Agents</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Autonomous market intelligence with policy-bound execution.</h1>
        <p className="mt-4 max-w-2xl text-sm text-dim">The model discovers and explains. PolicyEngine decides. The Agentic Wallet signs. {COPY.disclaimer}</p>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <StatusItem label="Agentic Wallet" value={wallet} />
          <StatusItem label="Agent Studio" value={studioStatus} />
          <StatusItem label="Desk worker" value={worker} />
          <StatusItem label="BSC" value="MAINNET" />
        </dl>
        {demo ? <p className="mt-4 text-[11px] tracking-[0.16em] text-gold">DEMO DATA · {demo.label}. Demo events are not agent executions.</p> : null}
      </header>

      <section className="mt-8" aria-labelledby="agent-pipeline">
        <h2 id="agent-pipeline" className="kicker">
          One architecture
        </h2>
        <ol className="mt-4 grid gap-2 text-sm md:grid-cols-4">
          {["Market data", "Parallax agent", "PolicyEngine", "Execution Passport", "Agentic Wallet", "BSC", "Execution receipt"].map((step, index) => (
            <li key={step} className="border-t border-line py-3">
              <span className="num text-dim">{index + 1}</span>
              <span className="mt-1 block">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-dim">BNB Agent Studio reaches the same agent through A2A, MCP, and B402/X402. That branch does not get a second signer.</p>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-2" aria-labelledby="capabilities">
        <div>
          <h2 id="capabilities" className="kicker">
            Capabilities
          </h2>
          <h3 className="mt-4 text-sm">What the agent can do</h3>
          <ul className="mt-2 space-y-2 text-sm text-dim">
            {AGENT_CAN.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm">What the agent cannot do</h3>
          <ul className="mt-2 space-y-2 text-sm text-dim">
            {AGENT_CANNOT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="kicker">Ask the agent</h2>
          <p className="mt-3 text-sm text-dim">These prompts use the existing copilot. They do not change policy, change a rail, or sign.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Scan for tokenized-equity gaps.", "Why is NVDA interesting?", "Compare all NVDA rails.", "What can the agent execute?", "Show my policy constraints.", "What happened in the last agent execution?"].map((prompt) => (
              <button key={prompt} type="button" className="h-11 border border-line px-3 text-left text-[11px] tracking-[0.06em] text-dim hover:text-gold" onClick={() => queueCopilot(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="agent-activity">
        <h2 id="agent-activity" className="kicker">
          Live agent activity
        </h2>
        {!liveFills.length ? <p className="mt-3 text-sm text-dim">No agent execution activity yet.</p> : null}
        <ul className="mt-3">
          {liveFills.map((row) => (
            <li key={row.id} className="border-t border-line py-3 text-sm">
              <p className="num text-[11px] text-dim">{new Date(row.at).toISOString().slice(11, 19)}</p>
              <p>{row.title}</p>
              <p className="text-dim">
                {row.status}
                {row.passportHash ? ` · passport ${row.passportHash.slice(0, 12)}` : ""}
                {row.txHash ? ` · ${row.txHash}` : row.receiptId ? ` · ${row.receiptId}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <AgentExecutionLog initial={fills} />
        </div>
        {demoActivity.length ? (
          <div className="mt-4">
            <p className="text-[11px] tracking-[0.16em] text-gold">DEMO DATA</p>
            <ul className="mt-2 text-sm text-gold">
              {demoActivity.map((row) => (
                <li key={`${row.at}-${row.text}`}>{row.text}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mt-8 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
        <div aria-labelledby="agentic-wallet">
          <h2 id="agentic-wallet" className="kicker">
            Binance Agentic Wallet
          </h2>
          <p className="mt-3 text-sm">
            <StatusChip tone={wallet === "CONNECTED" ? "open" : wallet === "DISCONNECTED" ? "offline" : "pending"}>{wallet}</StatusChip>
          </p>
          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="text-dim">BSC address</dt>
              <dd className="num">{wallet === "CONNECTED" && agentAddress ? shortAddr(agentAddress) : "—"}</dd>
            </div>
            <div>
              <dt className="text-dim">Network</dt>
              <dd>BNB Smart Chain · chain 56</dd>
            </div>
            <div>
              <dt className="text-dim">Execution</dt>
              <dd>Agentic market order</dd>
            </div>
            <div>
              <dt className="text-dim">Wallet session</dt>
              <dd>{wallet === "CONNECTED" ? "ACTIVE" : wallet === "DISCONNECTED" ? "INACTIVE" : "UNKNOWN"}</dd>
            </div>
          </dl>
          {wallet !== "CONNECTED" ? (
            <p className="mt-4 text-sm text-dim">Sign in through Binance Web3 Wallet to enable agent execution.</p>
          ) : null}
          <Link href="/wallet" className="mt-3 inline-flex h-11 items-center text-[11px] tracking-[0.16em] text-gold">
            {wallet === "CONNECTED" ? "Open wallet" : "Connect / sign in"}
          </Link>
          <p className="mt-4 text-sm text-dim">The agent proposes. PolicyEngine evaluates. The passport records the quote. The Agentic Wallet, not the model, sends the market order. The agent cannot sign an arbitrary transaction. The selected rail stays policy-bound.</p>
        </div>
        <div aria-labelledby="agent-studio">
          <h2 id="agent-studio" className="kicker">
            BNB Agent Studio
          </h2>
          <p className="mt-3 text-sm">{studioStatus}</p>
          <p className="mt-2 text-sm text-dim">Protocol faces: A2A, MCP, B402 / X402. Network: BSC mainnet.</p>
          <p className="num mt-2 text-sm">{studio.address ? shortAddr(studio.address) : "No Studio address on this desk."}</p>
          <p className="mt-3 text-sm text-dim">The desk reports ONLINE only when its ping to the local Studio runtime succeeds. A studio.toml file is not treated as a live connection. This page cannot see more of the Studio process than that ping.</p>
          <p className="mt-3 text-sm text-dim">The model analyzes and drafts. Fixed Studio code handles seller signing and commerce. Parallax market orders are not signed by that chat.</p>
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="mcp-tools">
        <h2 id="mcp-tools" className="kicker">
          MCP · does not sign
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="border-t border-line py-3 text-sm">
              <p>
                <span className="num">{tool.name}</span> <span className="text-dim">{tool.access}</span>
              </p>
              <p className="text-dim">{tool.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="strategies">
        <h2 id="strategies" className="kicker">
          Strategy automation
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-dim">Arming a strategy does not authorize unrestricted execution. The worker still quotes, builds a passport, checks policy, commits the payload, and sends through the Agentic Wallet.</p>
        {!strategies.length ? <p className="mt-3 text-sm text-dim">No armed strategy or saved job on this desk.</p> : null}
        <ul className="mt-4">
          {strategies.map((row) => (
            <li key={row.id} className="grid gap-1 border-t border-line py-3 text-sm md:grid-cols-4">
              <span>{row.name}</span>
              <span className="text-dim">{row.ticker}</span>
              <span className="text-dim">{row.condition} · {row.size}</span>
              <span>
                {row.state} · {row.lastAction}
              </span>
            </li>
          ))}
        </ul>
        <StrategyArm />
      </section>

      <section className="mt-8 grid gap-8 border-t border-line pt-6 lg:grid-cols-2">
        <div>
          <h2 className="kicker">Policy</h2>
          <p className="mt-2 text-sm text-dim">Read from the desk settings. Edit them in Settings. This page does not keep a second copy.</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Field label="Order cap" value={settings ? `${settings.orderCapUsdt} USDT` : "—"} />
            <Field label="Daily cap" value={settings ? `${spentToday.toFixed(2)} / ${settings.dailyCapUsdt} USDT` : "—"} />
            <Field label="Minimum net edge" value={settings ? `${settings.minNetEdgePct}%` : "—"} />
            <Field label="Maximum slippage" value={settings ? `${settings.maxSlipPct}%` : "—"} />
            <Field label="Minimum liquidity" value={settings ? `$${settings.minLiquidityUsd.toLocaleString("en-US")}` : "—"} />
            <Field label="Approval required" value={settings?.approvalRequired === false ? "NO" : "YES"} />
            <Field label="Kill switch" value={settings?.killSwitch ? "ON" : "OFF"} />
          </dl>
        </div>
        <div>
          <h2 className="kicker">Recent agent passport</h2>
          {shownPassport ? (
            <div className="mt-3 text-sm">
              <p className="num break-all text-[11px] text-dim">{shownPassport.hash}</p>
              <p className="mt-2">
                {shownPassport.body.intent.ticker} · {shownPassport.body.representation.symbol} · {shownPassport.body.intent.usdt} USDT
              </p>
              <p className="text-dim">
                {shownPassport.state} · policy {shownPassport.gate?.verdict || "—"} · {shownPassport.body.executionRequirement}
              </p>
              {shownPassport.commitment ? <p className="text-dim">Commitment {shownPassport.commitment.scheme} · {shownPassport.commitment.hash.slice(0, 12)}</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-dim">{latestPassportHash ? `Passport ${latestPassportHash.slice(0, 12)} is not in this desk store.` : "No agent passport has been stored on this desk."}</p>
          )}
          {passport && shownPassport && passport.hash === shownPassport.hash ? <ExecutionPassportPanel /> : null}
        </div>
      </section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="receipts">
        <h2 id="receipts" className="kicker">
          Recent agent executions
        </h2>
        {!receipts.length ? <p className="mt-3 text-sm text-dim">No execution receipt for an agent clip yet.</p> : null}
        <ul className="mt-3">
          {receipts.map((row) => (
            <li key={row.id} className="border-t border-line py-3 text-sm">
              <p>
                {row.status} · {row.ticker} · {row.rail}
              </p>
              <p className="text-dim">
                {row.passportHash ? `passport ${row.passportHash.slice(0, 12)} · ` : ""}
                {row.commitment ? `commitment ${row.commitment.slice(0, 12)} · ` : ""}
                {row.txOrOrder || "no transaction id"} · slippage {row.slippage}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="bnb-stack">
        <h2 id="bnb-stack" className="kicker">
          BNB / Binance stack
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {BNB_STACK.map((item) => (
            <li key={item.name} className="border-t border-line py-3 text-sm">
              <p>{item.name}</p>
              <p className="text-dim">{item.use}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className="num mt-1">{value}</dd>
    </div>
  );
}
