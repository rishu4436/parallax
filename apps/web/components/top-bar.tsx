"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { localClock } from "@parallax/core";
import { CommandField } from "./command";
import { Mark } from "./mark";
import { useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";
import { WalletChip } from "./wallet-chip";
import { useState } from "react";

export function TopBar() {
  const session = useParallax((s) => s.session);
  const view = useParallax((s) => s.view);
  const setView = useParallax((s) => s.setView);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const refreshDesk = useParallax((s) => s.refreshDesk);
  const refreshQuote = useParallax((s) => s.refreshQuote);
  const setWallet = useParallax((s) => s.setWallet);
  const { address } = useAccount();
  const mounted = useMounted();
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    if (address) setWallet(address);
  }, [address, setWallet]);

  useEffect(() => {
    void refreshDesk();
    void refreshQuote();
    const desk = setInterval(() => void refreshDesk(), 8000);
    const quote = setInterval(() => {
      if (!useParallax.getState().confirm) void refreshQuote();
    }, 20000);
    return () => {
      clearInterval(desk);
      clearInterval(quote);
    };
  }, [address, refreshDesk, refreshQuote]);

  useEffect(() => {
    if (!mounted) return;
    setClock(localClock());
    const tick = setInterval(() => setClock(localClock()), 1000);
    return () => clearInterval(tick);
  }, [mounted]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-5 md:px-7">
      <div className="shrink-0">
        <Mark />
      </div>
      <nav className="hidden shrink-0 items-center gap-1 sm:flex" aria-label="Desk">
        {(
          [
            ["trade", "Trade"],
            ["jobs", "Jobs"],
            ["wallet", "Wallet"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`px-3 py-1.5 text-[11px] tracking-[0.16em] ${view === id ? "bg-gold text-bg" : "text-dim hover:text-ink"}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <CommandField />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button className="hidden text-[11px] tracking-[0.16em] text-dim hover:text-gold sm:block" onClick={() => setSettingsOpen(true)}>
          Settings
        </button>
        <WalletChip />
        <div className="fog-target hidden max-w-[16rem] truncate border border-line px-3 py-1 text-[11px] tracking-[0.12em] text-dim lg:block">
          {session?.chip || "US cash"}
        </div>
        <div className="num hidden text-[11px] tracking-widest text-dim md:block">{clock}</div>
      </div>
    </header>
  );
}
