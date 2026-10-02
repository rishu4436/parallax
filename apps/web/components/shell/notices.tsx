"use client";

import { useEffect, useRef } from "react";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

export function Notices() {
  const notices = useParallax((s) => s.notices);
  const dismiss = useParallax((s) => s.dismissNotice);
  const notify = useParallax((s) => s.notify);
  const fills = useParallax((s) => s.fills);
  const seenFill = useRef<string | null>(null);

  useEffect(() => {
    const latest = fills[0];
    if (!latest || latest.id === seenFill.current) return;
    if (seenFill.current == null) {
      seenFill.current = latest.id;
      return;
    }
    seenFill.current = latest.id;
    const kind = latest.status === "failed" ? "down" : latest.status === "filled" ? "up" : "info";
    notify(`${latest.ticker} ${latest.status} · ${latest.note}`, kind, false);
  }, [fills, notify]);

  useEffect(() => {
    if (!notices.length) return;
    const timers = notices.map((row) => window.setTimeout(() => dismiss(row.id), 6000));
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [notices, dismiss]);

  if (!notices.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-16 right-4 z-menu flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2 desk:bottom-4">
      {notices.map((row) => (
        <button
          key={row.id}
          className={cn(
            "pointer-events-auto border border-line bg-bg px-3 py-3 text-left text-xs shadow-menu",
            row.kind === "down" && "text-down",
            row.kind === "up" && "text-up",
            row.kind === "warn" && "text-warn",
            row.kind === "demo" && "text-gold",
            row.kind === "info" && "text-ink",
          )}
          onClick={() => dismiss(row.id)}
        >
          {row.demo ? <span className="kicker mb-1 block text-gold">DEMO DATA</span> : null}
          <span>{row.text}</span>
        </button>
      ))}
    </div>
  );
}
