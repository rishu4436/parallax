"use client";

import { useEffect, useMemo, useRef } from "react";
import { COPY, listUnderlyings, parseCommand, wrapperList } from "@parallax/core";
import { useParallax } from "@/lib/store";

export function CommandField() {
  const command = useParallax((s) => s.command);
  const setCommand = useParallax((s) => s.setCommand);
  const selectTicker = useParallax((s) => s.selectTicker);
  const setUsdt = useParallax((s) => s.setUsdt);
  const openConfirm = useParallax((s) => s.openConfirm);
  const setSettingsOpen = useParallax((s) => s.setSettingsOpen);
  const setView = useParallax((s) => s.setView);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  async function run(raw = command) {
    const hit = parseCommand(raw);
    if (!hit) return;
    if (hit.type === "jump") {
      if (hit.target === "settings") setSettingsOpen(true);
      else if (hit.target === "strategies" || hit.target === "weekend") setView("jobs");
      else setView("wallet");
      setCommand("");
      return;
    }
    if (hit.type === "ticker") {
      setView("trade");
      await selectTicker(hit.hit.underlying.ticker, hit.hit.railLock);
      setCommand("");
      return;
    }
    setView("trade");
    setUsdt(hit.usdt);
    await selectTicker(hit.hit.underlying.ticker, hit.hit.railLock, hit.side);
    const state = useParallax.getState();
    const book =
      state.books.find((item) => item.wrapper.rail === (hit.hit.railLock || state.best?.wrapper.rail)) || state.best;
    if (book) await openConfirm(book, hit.side);
    setCommand("");
  }

  return (
    <div className="relative min-w-0">
      <input
        ref={input}
        value={command}
        onChange={(event) => setCommand(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void run();
        }}
        placeholder="Name, ticker, or ‘buy 25 NVDA’"
        className="h-10 w-full border-b border-line bg-transparent px-1 text-sm outline-none transition-colors duration-150 placeholder:text-dim focus:border-gold"
        aria-label="Command"
      />
      {command.trim() && (suggestions.length > 0 || parsed) ? (
        <div className="absolute left-0 right-0 top-12 z-20 overflow-hidden border border-line bg-bg shadow-2xl">
          {!parsed && !suggestions.length ? <p className="px-3 py-2 text-sm text-dim">{COPY.emptySearch}</p> : null}
          {parsed?.type === "trade" ? (
            <button className="block w-full px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => void run()}>
              {parsed.label}
            </button>
          ) : null}
          {parsed?.type === "jump" ? (
            <button className="block w-full px-3 py-2 text-left text-sm hover:bg-bg" onClick={() => void run()}>
              Open {parsed.label}
            </button>
          ) : null}
          {suggestions.map((item) => (
            <button
              key={item.ticker}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg"
              onClick={() => void run(item.ticker)}
            >
              <span>
                {item.name} <span className="text-dim">{item.ticker}</span>
              </span>
              <span className="text-xs text-dim">{wrapperList(item).map((wrapper) => wrapper.symbol).join(" · ")}</span>
            </button>
          ))}
          {command.trim() && !parsed && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-dim">{COPY.emptySearch}</p>
          ) : null}
        </div>
      ) : null}
      </div>
  );
}
