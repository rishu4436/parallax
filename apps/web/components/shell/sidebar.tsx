"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { shortAddr } from "@parallax/core";
import { Mark } from "@/components/mark";
import { NAV, navActive } from "@/lib/nav";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const beat = useParallax((s) => s.beat);
  const studio = useParallax((s) => s.studio);
  const wallet = useParallax((s) => s.wallet);
  const spentToday = useParallax((s) => s.spentToday);
  const settings = useParallax((s) => s.settings);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const workerLive = beat?.status === "live";

  return (
    <aside className="hidden h-full w-52 shrink-0 flex-col border-r border-line bg-bg desk:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Mark />
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-5" aria-label="Desk">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-baseline justify-between px-2 py-2 text-[11px] tracking-[0.16em]",
              navActive(pathname, item.href) ? "text-gold" : "text-dim hover:text-ink",
            )}
          >
            <span>{item.label}</span>
            <span className="num text-[10px] text-dim">{item.kicker}</span>
          </Link>
        ))}
        <button
          className="mt-4 px-2 py-2 text-left text-[11px] tracking-[0.16em] text-dim hover:text-gold"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </button>
      </nav>
      <div className="grid gap-2 border-t border-line px-5 py-4 text-[11px] tracking-[0.08em] text-dim">
        <p>
          Worker <span className={workerLive ? "text-up" : "text-down"}>{workerLive ? "LIVE" : "STOPPED"}</span>
        </p>
        <p>
          Studio <span className={studio.live ? "text-up" : "text-dim"}>{studio.live ? "LIVE" : "OFF"}</span>
        </p>
        <p className="num truncate" title={wallet}>
          {wallet ? shortAddr(wallet) : "No signer"}
        </p>
        <p className="num">
          {spentToday.toFixed(2)} / {settings?.dailyCapUsdt ?? "—"} USDT today
        </p>
        {settings?.killSwitch ? <p className="text-down">Kill switch on</p> : null}
      </div>
    </aside>
  );
}
