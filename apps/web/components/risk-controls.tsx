"use client";

import { useState } from "react";
import { useParallax } from "@/lib/store";
import type { Settings } from "@parallax/core";

export function RiskControls() {
  const settings = useParallax((s) => s.settings);
  const saveSettings = useParallax((s) => s.saveSettings);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [minNet, setMinNet] = useState(String(settings?.minNetEdgePct ?? 0.5));
  const [maxSlip, setMaxSlip] = useState(String(settings?.maxSlipPct ?? 0.5));
  const [minLiq, setMinLiq] = useState(String(settings?.minLiquidityUsd ?? 100000));
  const [maxTrade, setMaxTrade] = useState(String(settings?.orderCapUsdt ?? 25));

  if (!settings) return null;

  async function pauseAll() {
    setBusy(true);
    const message = await saveSettings({ ...settings, killSwitch: true });
    setBusy(false);
    setNote(message || "Kill switch on. Jobs will not queue.");
  }

  async function save() {
    if (!settings) return;
    setBusy(true);
    const next: Settings = {
      ...settings,
      minNetEdgePct: Number(minNet),
      maxSlipPct: Number(maxSlip),
      minLiquidityUsd: Number(minLiq),
      orderCapUsdt: Number(maxTrade),
      approvalRequired: true,
    };
    const message = await saveSettings(next);
    setBusy(false);
    setNote(message || "Limits saved. Jobs use these caps. Manual TRADE still needs your signature.");
    if (!message) setEdit(false);
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="kicker">Risk controls</h2>
        <span className="text-[10px] tracking-[0.14em] text-gold">APPROVAL REQUIRED</span>
      </div>
      {edit ? (
        <div className="mt-3 grid gap-2 text-xs text-dim">
          <label>
            Min net edge %
            <input value={minNet} onChange={(e) => setMinNet(e.target.value)} className="num mt-1 h-8 w-full border border-line bg-transparent px-2" />
          </label>
          <label>
            Max slip %
            <input value={maxSlip} onChange={(e) => setMaxSlip(e.target.value)} className="num mt-1 h-8 w-full border border-line bg-transparent px-2" />
          </label>
          <label>
            Min liquidity
            <input value={minLiq} onChange={(e) => setMinLiq(e.target.value)} className="num mt-1 h-8 w-full border border-line bg-transparent px-2" />
          </label>
          <label>
            Max job size USDT
            <input value={maxTrade} onChange={(e) => setMaxTrade(e.target.value)} className="num mt-1 h-8 w-full border border-line bg-transparent px-2" />
          </label>
          <button className="h-9 bg-gold text-[11px] tracking-[0.14em] text-bg disabled:opacity-40" disabled={busy} onClick={() => void save()}>
            SAVE LIMITS
          </button>
        </div>
      ) : (
        <dl className="mt-3 space-y-1 text-xs text-dim">
          <Row label="Max job size" value={`${settings.orderCapUsdt} USDT`} />
          <Row label="Max slippage" value={`${settings.maxSlipPct}%`} />
          <Row label="Min liquidity" value={`${settings.minLiquidityUsd}`} />
          <Row label="Min net edge" value={`${settings.minNetEdgePct}%`} />
        </dl>
      )}
      <div className="mt-3 flex gap-3">
        <button className="text-[11px] tracking-[0.14em] text-down" disabled={busy} onClick={() => void pauseAll()}>
          PAUSE ALL
        </button>
        <button className="text-[11px] tracking-[0.14em] text-gold" onClick={() => setEdit((v) => !v)}>
          {edit ? "CLOSE" : "EDIT LIMITS"}
        </button>
      </div>
      {note ? <p className="mt-2 text-xs text-dim">{note}</p> : null}
      {settings.killSwitch ? <p className="mt-2 text-xs text-down">Kill switch is on.</p> : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="num text-ink">{value}</dd>
    </div>
  );
}
