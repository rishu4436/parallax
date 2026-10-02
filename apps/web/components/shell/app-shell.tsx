"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ConfirmTakeover } from "@/components/confirm-takeover";
import { SettingsSheet } from "@/components/settings-sheet";
import { viewForPath } from "@/lib/nav";
import { useParallax } from "@/lib/store";
import { CommandBar } from "./command-bar";
import { CommandPalette } from "./command-palette";
import { CopilotRegion } from "./copilot-region";
import { MobileNav } from "./mobile-nav";
import { Notices } from "./notices";
import { Sidebar } from "./sidebar";
import { SessionStatus } from "./session-status";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const setView = useParallax((s) => s.setView);
  const confirm = useParallax((s) => s.confirm);
  const setPaletteOpen = useParallax((s) => s.setPaletteOpen);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const setCopilotOpen = useParallax((s) => s.setCopilotOpen);
  const refreshDesk = useParallax((s) => s.refreshDesk);
  const refreshQuote = useParallax((s) => s.refreshQuote);
  const refreshScan = useParallax((s) => s.refreshScan);
  const wallet = useParallax((s) => s.wallet);
  const { address } = useAccount();

  useEffect(() => {
    const view = viewForPath(pathname);
    if (view) setView(view);
  }, [pathname, setView]);

  useEffect(() => {
    if (!confirm) return;
    setPaletteOpen(false);
    setSettingsOpen(false);
    setCopilotOpen(false);
  }, [confirm, setPaletteOpen, setSettingsOpen, setCopilotOpen]);

  useEffect(() => {
    void refreshDesk();
    void refreshQuote();
    void refreshScan();
    const desk = setInterval(() => void refreshDesk(), 8000);
    const quote = setInterval(() => {
      if (!useParallax.getState().confirm) void refreshQuote();
    }, 20000);
    const scan = setInterval(() => void refreshScan(), 40000);
    return () => {
      clearInterval(desk);
      clearInterval(quote);
      clearInterval(scan);
    };
  }, [address, wallet, refreshDesk, refreshQuote, refreshScan]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg/80 text-ink desk:flex-row">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CommandBar />
        <div className="flex items-center border-b border-line px-4 py-2 desk:hidden">
          <SessionStatus compact />
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</div>
          <CopilotRegion />
        </div>
        <MobileNav />
      </div>
      <CommandPalette />
      <Notices />
      <SettingsSheet />
      <ConfirmTakeover />
    </div>
  );
}
