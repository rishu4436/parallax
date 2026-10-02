"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, navActive } from "@/lib/nav";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const setCopilotOpen = useParallax((s) => s.setCopilotOpen);

  return (
    <nav className="flex overflow-x-auto border-t border-line desk:hidden" aria-label="Desk">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "h-12 shrink-0 flex-1 px-2 text-center text-[11px] leading-[3rem] tracking-[0.14em]",
            navActive(pathname, item.href) ? "text-gold" : "text-dim",
          )}
        >
          {item.label}
        </Link>
      ))}
      <button className="h-12 shrink-0 flex-1 px-2 text-[11px] tracking-[0.14em] text-dim" onClick={() => setCopilotOpen(true)}>
        Copilot
      </button>
      <button className="h-12 shrink-0 flex-1 px-2 text-[11px] tracking-[0.14em] text-dim" onClick={() => setSettingsOpen(true)}>
        Settings
      </button>
    </nav>
  );
}
