"use client";

import { useState } from "react";
import { useParallax } from "@/lib/store";
import type { Rail, Side } from "@parallax/core";

interface Message {
  role: "user" | "desk";
  text: string;
}

export function Copilot() {
  const opportunities = useParallax((s) => s.opportunities);
  const ticker = useParallax((s) => s.ticker);
  const books = useParallax((s) => s.books);
  const selectTicker = useParallax((s) => s.selectTicker);
  const setUsdt = useParallax((s) => s.setUsdt);
  const setAnalyzeOpen = useParallax((s) => s.setAnalyzeOpen);
  const openConfirm = useParallax((s) => s.openConfirm);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "desk", text: "Ask the live book. Prices come from quotes on this desk, not from a model." },
  ]);

  async function ask(raw = text) {
    const q = raw.trim();
    if (!q || busy) return;
    setText("");
    setMessages((rows) => [...rows, { role: "user", text: q }]);
    setBusy(true);
    const active = books.find((book) => book.best?.ok);
    const res = await fetch("/api/copilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: q,
        cards: opportunities,
        focus: { ticker, symbol: active?.wrapper.symbol, netPct: null },
      }),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      text?: string;
      message?: string;
      action?: { ticker: string; rail?: Rail; side?: Side; usdt?: string; analyze?: boolean; simulate?: boolean };
    };
    setBusy(false);
    setMessages((rows) => [...rows, { role: "desk", text: body.text || body.message || "No live answer." }]);
    const action = body.action;
    if (!action) return;
    if (action.usdt) setUsdt(action.usdt);
    if (action.analyze) setAnalyzeOpen(true);
    await selectTicker(action.ticker, action.rail, action.side);
    if (action.simulate) {
      const state = useParallax.getState();
      const book = state.books.find((row) => row.wrapper.rail === action.rail) || state.best;
      if (book) await openConfirm(book, action.side || "buy");
    }
  }

  return (
    <section>
      <h2 className="kicker">Trade copilot</h2>
      <div className="mt-3 max-h-56 space-y-2 overflow-auto text-sm">
        {messages.map((row, index) => (
          <p key={index} className={row.role === "user" ? "text-gold" : "text-dim"}>
            {row.text}
          </p>
        ))}
      </div>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Find opportunities above 1%"
          className="h-10 w-full border border-line bg-transparent px-3 text-sm outline-none focus:border-gold"
        />
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {["Opportunities above 1%", "Compare NVDA", "Why is this flagged?"].map((hint) => (
          <button key={hint} className="text-[11px] tracking-[0.08em] text-dim hover:text-gold" onClick={() => void ask(hint)}>
            {hint}
          </button>
        ))}
      </div>
    </section>
  );
}
