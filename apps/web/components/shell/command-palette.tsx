"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { COPY, listUnderlyings, parseCommand, wrapperList } from "@parallax/core";
import { runCommand } from "@/lib/run-command";
import { useGo } from "@/lib/use-go";
import { useParallax } from "@/lib/store";
import { cn } from "@/lib/utils";

const STATIC = [
  { label: "Overview", run: "/" },
  { label: "Markets", run: "/markets" },
  { label: "Opportunities", run: "/opportunities" },
  { label: "Portfolio", run: "/portfolio" },
  { label: "Activity", run: "/activity" },
  { label: "Strategies", run: "/strategies" },
  { label: "Developer", run: "/developer" },
  { label: "Agents", run: "/agents" },
  { label: "Trade", run: "trade" },
  { label: "Jobs", run: "jobs" },
  { label: "Wallet", run: "wallet" },
  { label: "Settings", run: "settings" },
] as const;

export function CommandPalette() {
  const open = useParallax((s) => s.paletteOpen);
  const setOpen = useParallax((s) => s.setPaletteOpen);
  const command = useParallax((s) => s.command);
  const setCommand = useParallax((s) => s.setCommand);
  const go = useGo();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useParallax.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setActive(0);
      const id = window.setTimeout(() => input.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const parsed = command.trim() ? parseCommand(command) : null;
  const suggestions = useMemo(() => {
    const q = command.trim().toLowerCase();
    if (!q || parsed?.type === "jump") return [];
    return listUnderlyings()
      .filter((item) => {
        const symbols = wrapperList(item).map((wrapper) => wrapper.symbol.toLowerCase());
        return item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || symbols.some((symbol) => symbol.includes(q));
      })
      .slice(0, 6);
  }, [command, parsed]);

  const rows: Array<{ key: string; label: string; detail?: string; run: string }> = [];
  if (parsed?.type === "trade") rows.push({ key: "trade", label: parsed.label, run: command });
  if (parsed?.type === "jump") rows.push({ key: "jump", label: `Open ${parsed.label}`, run: command });
  if (parsed?.type === "ticker") rows.push({ key: "ticker", label: parsed.label, run: command });
  for (const item of suggestions) {
    if (rows.some((row) => row.key === item.ticker)) continue;
    rows.push({
      key: item.ticker,
      label: `${item.name} ${item.ticker}`,
      detail: wrapperList(item)
        .map((wrapper) => wrapper.symbol)
        .join(" · "),
      run: item.ticker,
    });
  }
  if (!command.trim()) {
    for (const item of STATIC) rows.push({ key: item.run, label: item.label, run: item.run });
  }
  if (command.trim() && !parsed && suggestions.length === 0) {
    rows.push({ key: "ask", label: `Ask the live book: ${command.trim()}`, run: command });
  }

  async function choose(raw: string) {
    if (raw.startsWith("/")) {
      router.push(raw);
      setCommand("");
      setOpen(false);
      return;
    }
    await runCommand(raw, go, (href) => router.push(href));
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-modal bg-bg/88" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-modal w-full max-w-xl -translate-x-1/2 border border-line bg-bg">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search a ticker or jump to a desk view. Prices come from live quotes.</Dialog.Description>
          <p className="kicker px-4 pt-4">Command</p>
          <input
            ref={input}
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(0, rows.length - 1)));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const row = rows[active] || rows[0];
                if (row) void choose(row.run);
              }
            }}
            placeholder="NVDA, buy 10 TSLA, jobs, settings"
            className="field-command mx-4 mt-3 w-[calc(100%-2rem)]"
            aria-label="Command"
          />
          <ul className="mt-3 max-h-72 overflow-auto border-t border-line">
            {rows.length === 0 ? <li className="px-4 py-3 text-sm text-dim">{COPY.emptySearch}</li> : null}
            {rows.map((row, index) => (
              <li key={row.key}>
                <button
                  className={cn("flex w-full items-center justify-between px-4 py-2.5 text-left text-sm", index === active ? "text-gold" : "text-ink hover:text-gold")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => void choose(row.run)}
                >
                  <span>{row.label}</span>
                  {row.detail ? <span className="text-xs text-dim">{row.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
