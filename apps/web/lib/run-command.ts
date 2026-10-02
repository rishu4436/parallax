"use client";

import { parseCommand, parseCopilot } from "@parallax/core";
import { hrefForView, type DeskView } from "./nav";
import { useParallax } from "./store";

export async function runCommand(raw: string, go: (view: DeskView) => void, push: (href: string) => void): Promise<void> {
  const text = raw.trim();
  if (!text) return;
  const store = useParallax.getState();
  const hit = parseCommand(text);

  if (!hit) {
    const intent = parseCopilot(text);
    if (intent.type === "help") {
      store.setCopilotOpen(true);
      store.setPaletteOpen(false);
      return;
    }
    go("trade");
    const res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        cards: store.opportunities,
        focus: { ticker: store.ticker, netPct: null },
      }),
    });
    const body = (await res.json()) as {
      action?: { ticker?: string; rail?: "bStock" | "ondo" | "xStock"; side?: "buy" | "sell"; usdt?: string; analyze?: boolean; simulate?: boolean };
      text?: string;
      message?: string;
    };
    if (body.action?.usdt) store.setUsdt(body.action.usdt);
    if (body.action?.analyze) store.setAnalyzeOpen(true);
    if (body.action?.ticker) await store.selectTicker(body.action.ticker, body.action.rail, body.action.side);
    if (body.action?.simulate) {
      const state = useParallax.getState();
      const book = state.books.find((item) => item.wrapper.rail === body.action?.rail) || state.best;
      if (book) await store.openConfirm(book, body.action.side || "buy");
    }
    if (!body.action && (body.text || body.message)) store.notify(body.text || body.message || "", "info");
    store.setCommand("");
    store.setPaletteOpen(false);
    return;
  }

  if (hit.type === "jump") {
    if (hit.target === "settings") store.setSettingsOpen(true);
    else if (hit.target === "home") push("/");
    else if (hit.target === "trade") go("trade");
    else if (hit.target === "jobs" || hit.target === "strategies" || hit.target === "weekend") go("jobs");
    else go("wallet");
    store.setCommand("");
    store.setPaletteOpen(false);
    return;
  }

  if (hit.type === "ticker") {
    go("trade");
    await store.selectTicker(hit.hit.underlying.ticker, hit.hit.railLock);
    store.setCommand("");
    store.setPaletteOpen(false);
    return;
  }

  go("trade");
  store.setUsdt(hit.usdt);
  await store.selectTicker(hit.hit.underlying.ticker, hit.hit.railLock, hit.side);
  const state = useParallax.getState();
  const book = state.books.find((item) => item.wrapper.rail === (hit.hit.railLock || state.best?.wrapper.rail)) || state.best;
  if (book) await store.openConfirm(book, hit.side);
  store.setCommand("");
  store.setPaletteOpen(false);
}

export function jumpHref(target: string): string {
  if (target === "home") return "/";
  if (target === "trade") return hrefForView("trade");
  if (target === "jobs" || target === "strategies" || target === "weekend") return hrefForView("jobs");
  if (target === "settings") return hrefForView("trade");
  return hrefForView("wallet");
}
