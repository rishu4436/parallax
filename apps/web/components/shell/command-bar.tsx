"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { DEMO_SCENARIOS, localClock } from "@parallax/core";
import { Mark } from "@/components/mark";
import { WalletChip } from "@/components/wallet-chip";
import { useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { SessionStatus } from "./session-status";

export function CommandBar() {
  const demo = useParallax((s) => s.demo);
  const setDemo = useParallax((s) => s.setDemo);
  const setPaletteOpen = useParallax((s) => s.setPaletteOpen);
  const setCopilotOpen = useParallax((s) => s.setCopilotOpen);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const command = useParallax((s) => s.command);
  const setWallet = useParallax((s) => s.setWallet);
  const { address } = useAccount();
  const mounted = useMounted();
  const [clock, setClock] = useState("--:--:--");
  const shortcut = mounted && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘K" : "Ctrl+K";

  useEffect(() => {
    if (address) setWallet(address);
  }, [address, setWallet]);

  useEffect(() => {
    if (!mounted) return;
    setClock(localClock());
    const tick = setInterval(() => setClock(localClock()), 1000);
    return () => clearInterval(tick);
  }, [mounted]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
      <div className="shrink-0 desk:hidden">
        <Mark />
      </div>
      <div className="hidden min-w-0 shrink-0 desk:block">
        <SessionStatus compact />
      </div>
      <button
        className="min-w-0 flex-1 truncate border-b border-line px-1 py-2 text-left text-sm text-dim transition-colors duration-parallax hover:border-gold hover:text-ink"
        onClick={() => setPaletteOpen(true)}
        aria-label="Open command palette"
      >
        {command.trim() || `Name, ticker, buy 25 NVDA · ${shortcut}`}
      </button>
      <select
        className={`hidden max-w-[9rem] bg-transparent text-[11px] tracking-[0.08em] sm:block ${demo ? "text-gold" : "text-dim"}`}
        value={demo?.id || ""}
        onChange={(event) => setDemo((event.target.value || null) as (typeof DEMO_SCENARIOS)[number]["id"] | null)}
        aria-label="Demo scenario"
      >
        <option value="">Live quotes</option>
        {DEMO_SCENARIOS.map((row) => (
          <option key={row.id} value={row.id}>
            DEMO · {row.label}
          </option>
        ))}
      </select>
      <button className="hidden text-[11px] tracking-[0.16em] text-dim hover:text-gold sm:block desk:hidden" onClick={() => setCopilotOpen(true)}>
        Copilot
      </button>
      <button className="hidden text-[11px] tracking-[0.16em] text-dim hover:text-gold sm:block desk:hidden" onClick={() => setSettingsOpen(true)}>
        Settings
      </button>
      <WalletChip />
      <div className="num hidden text-[11px] tracking-widest text-dim md:block">{clock}</div>
    </header>
  );
}
