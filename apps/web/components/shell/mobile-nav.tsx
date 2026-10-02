"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MOBILE_MORE, MOBILE_PRIMARY, navActive } from "@/lib/nav";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const setCopilotOpen = useParallax((s) => s.setCopilotOpen);

  return (
    <div className="desk:hidden">
      {more ? (
        <div className="border-t border-line bg-bg px-4 py-3" role="dialog" aria-label="More destinations">
          <div className="grid grid-cols-2 gap-1">
            {MOBILE_MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("inline-flex h-11 items-center text-[11px] tracking-[0.14em]", navActive(pathname, item.href) ? "text-gold" : "text-dim")}
                onClick={() => setMore(false)}
              >
                {item.label}
              </Link>
            ))}
            <button type="button" className="h-11 text-left text-[11px] tracking-[0.14em] text-dim" onClick={() => { setMore(false); setCopilotOpen(true); }}>
              Copilot
            </button>
            <button type="button" className="h-11 text-left text-[11px] tracking-[0.14em] text-dim" onClick={() => { setMore(false); setSettingsOpen(true); }}>
              Settings
            </button>
          </div>
        </div>
      ) : null}
      <nav className="flex border-t border-line" aria-label="Parallax">
        {MOBILE_PRIMARY.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("h-12 flex-1 text-center text-[10px] leading-[3rem] tracking-[0.08em]", navActive(pathname, item.href) ? "text-gold" : "text-dim")}
          >
            {item.label}
          </Link>
        ))}
        <button type="button" className="h-12 flex-1 text-[10px] tracking-[0.08em] text-dim" aria-expanded={more} onClick={() => setMore((value) => !value)}>
          More
        </button>
      </nav>
    </div>
  );
}
