"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { COPY, type Rail, type Settings } from "@parallax/core";
import { useParallax } from "@/lib/store";
import { useEffect, useRef, useState } from "react";

const RAILS: Rail[] = ["bStock", "ondo", "xStock"];

export function SettingsSheet() {
  const open = useParallax((s) => s.settingsOpen);
  const setOpen = useParallax((s) => s.setSettingsOpen);
  const settings = useParallax((s) => s.settings);
  const save = useParallax((s) => s.saveSettings);
  const [orderCap, setOrderCap] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [rails, setRails] = useState<Rail[]>(RAILS);
  const [killSwitch, setKillSwitch] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || !settings) return;
    seeded.current = true;
    setOrderCap(String(settings.orderCapUsdt));
    setDailyCap(String(settings.dailyCapUsdt));
    setRails([...settings.allowedRails]);
    setKillSwitch(settings.killSwitch);
    setError("");
  }, [open, settings]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-line bg-bg p-8 shadow-2xl">
          <Dialog.Title className="display text-4xl">Settings</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-dim">{COPY.disclaimer}</Dialog.Description>
          {settings ? (
            <form
              className="mt-6 grid gap-4 text-sm"
              onSubmit={(event) => {
                event.preventDefault();
                const orderCapUsdt = Number(orderCap);
                const dailyCapUsdt = Number(dailyCap);
                if (!Number.isFinite(orderCapUsdt) || orderCapUsdt <= 0) {
                  setError("Order cap must be a number greater than zero.");
                  return;
                }
                if (!Number.isFinite(dailyCapUsdt) || dailyCapUsdt <= 0) {
                  setError("Daily cap must be a number greater than zero.");
                  return;
                }
                if (!rails.length) {
                  setError("At least one rail stays on.");
                  return;
                }
                const next: Settings = { orderCapUsdt, dailyCapUsdt, allowedRails: rails, killSwitch };
                setSaving(true);
                void save(next).then((message) => {
                  setSaving(false);
                  if (message) {
                    setError(message);
                    return;
                  }
                  setOpen(false);
                });
              }}
            >
              <p className="text-xs text-dim">These caps bind jobs the worker queues. Buy and Sell on Trade use the size you type.</p>
              <label className="grid gap-1 text-xs text-dim">
                Agent order cap USDT
                <input
                  className="num h-10 rounded-md border border-line bg-raised px-3"
                  inputMode="decimal"
                  value={orderCap}
                  onChange={(event) => setOrderCap(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-xs text-dim">
                Agent daily cap USDT
                <input
                  className="num h-10 rounded-md border border-line bg-raised px-3"
                  inputMode="decimal"
                  value={dailyCap}
                  onChange={(event) => setDailyCap(event.target.value)}
                />
              </label>
              <fieldset className="grid gap-2">
                <legend className="text-xs text-dim">Allowed rails</legend>
                {RAILS.map((rail) => (
                  <label key={rail} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rails.includes(rail)}
                      onChange={(event) => {
                        setRails(event.target.checked ? [...rails, rail] : rails.filter((item) => item !== rail));
                      }}
                    />
                    {rail}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={killSwitch} onChange={(event) => setKillSwitch(event.target.checked)} />
                Kill switch
              </label>
              {killSwitch ? <p className="text-down">{COPY.killSwitch}</p> : null}
              {error ? <p className="text-down">{error}</p> : null}
              <button className="h-10 rounded-md bg-gold font-semibold text-bg" disabled={saving}>
                {saving ? "Saving" : "Save"}
              </button>
            </form>
          ) : (
            <p className="mt-6 text-sm text-dim">Loading caps.</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
