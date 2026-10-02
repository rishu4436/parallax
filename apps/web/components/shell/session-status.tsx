"use client";

import { cashSession } from "@parallax/core";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SessionStatus({ compact = false }: { compact?: boolean }) {
  const session = useParallax((s) => s.session);
  const quoting = useParallax((s) => s.quoting);
  const clock = session ?? cashSession();
  const cashOpen = clock.atmosphere === "open";

  return (
    <div className={cn("flex items-center gap-3", compact ? "text-[11px] tracking-[0.12em]" : "text-xs")}>
      <span className={cn("text-[10px] tracking-[0.22em]", cashOpen ? "text-up" : "text-down")}>US {cashOpen ? "OPEN" : "CLOSED"}</span>
      <span className="text-[10px] tracking-[0.22em] text-up">BSC OPEN</span>
      {clock.chip ? <span className="hidden max-w-[24rem] truncate text-dim xl:inline">{clock.chip}</span> : null}
      {quoting ? <span className="text-[10px] tracking-[0.22em] text-dim">QUOTING</span> : null}
    </div>
  );
}
