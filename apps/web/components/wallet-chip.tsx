"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { bsc } from "wagmi/chains";
import type { Connector } from "wagmi";
import { shortAddr } from "@parallax/core";
import { useParallax } from "@/lib/store";
import { useMounted } from "@/lib/use-mounted";

interface SigninData {
  urlForWeb?: string;
  qrCodeId?: string;
  pairingCode?: string;
  status?: string;
}

export function WalletChip() {
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const setWallet = useParallax((s) => s.setWallet);
  const connectNonce = useParallax((s) => s.connectNonce);
  const [open, setOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"CONNECTED" | "UNCONNECTED" | "CHECKING">("CHECKING");
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signin, setSignin] = useState<SigninData | null>(null);

  async function refreshAgent() {
    const res = await fetch("/api/agentic");
    const body = (await res.json()) as { status?: string; address?: string | null; message?: string };
    const next = body.status === "CONNECTED" ? "CONNECTED" : "UNCONNECTED";
    setAgentStatus(next);
    setAgentAddress(body.address || null);
    if (!address && body.address) setWallet(body.address as `0x${string}`);
    if (body.message && next === "UNCONNECTED") setLocalError(body.message);
  }

  useEffect(() => {
    void refreshAgent();
  }, [address]);

  useEffect(() => {
    if (connectNonce > 0) setOpen(true);
  }, [connectNonce]);

  async function startAgent() {
    setLocalError(null);
    setBusy("Starting sign-in");
    const res = await fetch("/api/agentic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "signin" }),
    });
    const body = (await res.json()) as { ok?: boolean; message?: string; data?: SigninData };
    if (!body.ok || !body.data) {
      setBusy(null);
      setLocalError(body.message || "Sign-in did not start.");
      return;
    }
    if (body.data.status === "ALREADY_CONNECTED") {
      setBusy(null);
      await refreshAgent();
      setOpen(false);
      return;
    }
    setSignin(body.data);
    if (body.data.urlForWeb) window.open(body.data.urlForWeb, "_blank", "noopener,noreferrer");
    setBusy("Waiting for the Binance App");
    const verified = await fetch("/api/agentic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "verify", qrCodeId: body.data.qrCodeId }),
    });
    const done = (await verified.json()) as { ok?: boolean; message?: string };
    setBusy(null);
    if (!done.ok) {
      setLocalError(done.message || "Sign-in was not confirmed.");
      return;
    }
    setSignin(null);
    await refreshAgent();
    setOpen(false);
  }

  async function signOutAgent() {
    setBusy("Signing out");
    await fetch("/api/agentic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "signout" }),
    });
    setAgentAddress(null);
    setAgentStatus("UNCONNECTED");
    setBusy(null);
    if (!address) setWallet(undefined);
  }

  const choices = uniqueConnectors(connectors);
  const shown = address || (agentStatus === "CONNECTED" && agentAddress ? agentAddress : null);

  if (!mounted) {
    return <button className="bg-gold px-3 py-1.5 text-[11px] tracking-[0.16em] text-bg">Connect</button>;
  }

  return (
    <div className="relative">
      {shown && isConnected && address ? (
        <div className="flex items-center gap-2">
          {chainId !== bsc.id ? (
            <button className="text-xs text-down" onClick={() => switchChain({ chainId: bsc.id })}>
              Switch to BSC
            </button>
          ) : null}
          <button className="num border border-line px-3 py-1.5 text-[11px] tracking-[0.08em]" onClick={() => disconnect()} title={error?.message || address}>
            {shortAddr(address)} · BSC
          </button>
        </div>
      ) : (
        <button className="bg-gold px-3 py-1.5 text-[11px] tracking-[0.16em] text-bg hover:bg-goldDim" onClick={() => setOpen((value) => !value)}>
          {isPending || busy ? "Connecting" : shown ? `${shortAddr(shown)} · Agent` : "Connect"}
        </button>
      )}
      {open ? (
        <div className="absolute right-0 top-11 z-30 w-72 border border-line bg-bg p-3 shadow-2xl">
          <p className="kicker">Choose a wallet</p>
          <ul className="mt-3 space-y-1">
            {choices.map((connector) => (
              <li key={connector.uid}>
                <button
                  className="w-full border border-line px-3 py-2 text-left text-sm hover:border-gold"
                  onClick={() => {
                    setLocalError(null);
                    connect({ connector, chainId: bsc.id });
                    setOpen(false);
                  }}
                >
                  {walletLabel(connector)}
                </button>
              </li>
            ))}
            <li>
              <button className="w-full border border-line px-3 py-2 text-left text-sm hover:border-gold" onClick={() => void startAgent()}>
                Binance Agentic Wallet
                <span className="mt-1 block text-xs text-dim">
                  {agentStatus === "CONNECTED" && agentAddress ? `Signed in ${shortAddr(agentAddress)}` : "Sign in once in the Binance App"}
                </span>
              </button>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-dim">
            Rabby, OKX, Trust, and any other wallet installed in this browser show up here under their own name.
            {!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
              ? " A phone wallet needs WalletConnect, which appears after NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set."
              : " A phone wallet uses WalletConnect."}
          </p>
          {signin?.pairingCode ? <p className="num mt-3 text-3xl tracking-[0.18em]">{signin.pairingCode}</p> : null}
          {signin?.urlForWeb ? (
            <a className="mt-2 block break-all text-xs text-gold" href={signin.urlForWeb} target="_blank" rel="noreferrer">
              Open the Binance App
            </a>
          ) : null}
          {busy ? <p className="mt-2 text-xs">{busy}</p> : null}
          {localError || error?.message ? <p className="mt-2 text-xs text-down">{localError || error?.message}</p> : null}
          {agentStatus === "CONNECTED" ? (
            <button className="mt-3 text-[11px] tracking-[0.14em] text-dim" onClick={() => void signOutAgent()}>
              Sign out of Agentic Wallet
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function walletLabel(connector: Connector): string {
  const id = `${connector.id} ${connector.name}`.toLowerCase();
  if (id.includes("binance")) return "Binance Wallet";
  if (id.includes("metamask")) return "MetaMask";
  if (id.includes("walletconnect")) return "WalletConnect";
  return connector.name || "Wallet";
}

function uniqueConnectors(connectors: readonly Connector[]): Connector[] {
  const seen = new Set<string>();
  const out: Connector[] = [];
  for (const connector of connectors) {
    if (connector.id === "injected" || connector.name === "Injected") continue;
    const label = walletLabel(connector);
    if (seen.has(label) && label !== connector.name) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(connector);
  }
  return out;
}
