"use client";

import { Home, Layers, ScrollText, Settings } from "lucide-react";
import { useParallax } from "@/lib/store";

const items = [
  { id: "home", label: "Home", icon: Home, target: "top" },
  { id: "settings", label: "Settings", icon: Settings, target: "settings" },
  { id: "strategies", label: "Strategies", icon: Layers, target: "strategies" },
  { id: "tape", label: "Tape", icon: ScrollText, target: "tape" },
] as const;

export function LeftRail() {
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line py-4" aria-label="Sections">
      {items.map((item) => (
        <button
          key={item.id}
          title={item.label}
          aria-label={item.label}
          className="flex h-10 w-10 items-center justify-center text-dim transition-colors duration-150 hover:text-gold"
          onClick={() => {
            if (item.target === "settings") {
              setSettingsOpen(true);
              return;
            }
            if (item.target === "tape" || item.target === "strategies") {
              document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              return;
            }
            document.querySelector("main")?.scrollTo({ top: 0 });
          }}
        >
          <item.icon size={18} />
        </button>
      ))}
    </nav>
  );
}
