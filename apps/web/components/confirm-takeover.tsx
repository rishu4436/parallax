"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { bsc } from "wagmi/chains";
import type { Address, Hex } from "viem";
import {
  confirmGate,
  COPY,
  formatQty,
  fromBaseUnits,
  parseTypedData,
  plainSimulate,
  QUOTE_ASSETS,
  type TapeRow,
} from "@parallax/core";
import { underlyingName, useParallax } from "@/lib/store";

export function ConfirmTakeover() {
  const confirmState = useParallax((s) => s.confirm);
  const ticker = useParallax((s) => s.ticker);
  const closeConfirm = useParallax((s) => s.closeConfirm);
  const requoteConfirm = useParallax((s) => s.requoteConfirm);
  const pushTape = useParallax((s) => s.pushTape);
  const setConfirmResult = useParallax((s) => s.setConfirmResult);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  if (!confirmState) return null;
  const confirm = confirmState;
  const result = confirm.result;
  const quote = result && "quote" in result && result.quote ? result.quote : confirm.quote;
  const left = Math.max(0, quote.quoteExpiresAt - now);
  const expired = left <= 0;
  const gate = confirmGate({
    now,
    quoteExpiresAt: quote.quoteExpiresAt,
    simulateStatus:
      result?.step === "sign-swap" ? result.simulateStatus : result?.step === "sign-rfq" ? "SUCCESS" : result?.step === "approve" ? "SUCCESS" : "PENDING",
    simulateReason: result?.step === "sign-swap" ? result.simulateReason : undefined,
    executionMode: quote.executionMode,
    state: expired ? "expired" : "awaiting_signature",
  });
  const signOff = !gate.sign || confirm.preparing || Boolean(busy) || result?.step === "rejected" || result?.step === "expired";
  const qty = quote.ok ? formatQty(fromBaseUnits(quote.outAmount, quote.wrapper.decimals)) : "—";

  async function remember(row: TapeRow) {
    await pushTape(row);
  }

  async function broadcast(serialized: Hex, row: TapeRow, close: boolean) {
    const res = await fetch("/api/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signedTransaction: serialized, address, tape: row }),
    });
    const body = (await res.json()) as { ok: boolean; txHash?: string; message?: string; code?: number };
    if (!body.ok || !body.txHash) {
      await remember({ ...row, status: "failed", errorText: body.message || "Broadcast failed" });
      setLocalError(body.message || "Broadcast failed");
      return false;
    }
    await remember({ ...row, status: "submitted", txHash: body.txHash });
    if (publicClient) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: body.txHash as Hex });
      const history = await fetch(`/api/broadcast?txHash=${body.txHash}`).then((item) => item.json()).catch(() => null);
      await remember({
        ...row,
        status: receipt.status === "success" ? (close ? "filled" : "approved") : "failed",
        txHash: body.txHash,
        errorText: receipt.status === "success" ? undefined : JSON.stringify(history?.history || receipt.status),
      });
      if (receipt.status !== "success") return false;
    }
    if (close) closeConfirm();
    return true;
  }

  async function onSign() {
    if (!result || result.step === "rejected" || result.step === "expired") return;
    if (!address || !walletClient) {
      setLocalError("Connect the browser Binance Web3 Wallet. Agentic sign-in can quote. It cannot sign this transaction.");
      return;
    }
    setLocalError(null);
    setBusy("Waiting for your signature");
    const row: TapeRow = {
      id: confirm.requestId,
      at: Date.now(),
      side: confirm.side,
      ticker,
      symbol: quote.wrapper.symbol,
      rail: quote.wrapper.rail,
      usd: confirm.usdt,
      status: "signing",
      vendorName: quote.vendorName,
      source: confirm.actor,
    };
    try {
      if (result.step === "approve") {
        const serialized = await walletClient.signTransaction({
          account: address,
          chain: bsc,
          to: result.tx.to as Address,
          data: result.tx.data as Hex,
          value: 0n,
          gas: result.tx.gas ? BigInt(result.tx.gas) : undefined,
          gasPrice: result.tx.gasPrice ? BigInt(result.tx.gasPrice) : undefined,
        });
        const approved = await broadcast(serialized, { ...row, status: "approving", symbol: quote.wrapper.symbol }, false);
        setBusy(null);
        if (approved) await requoteConfirm();
        return;
      }
      if (result.step === "sign-swap") {
        const serialized = await walletClient.signTransaction({
          account: address,
          chain: bsc,
          to: result.tx.to as Address,
          data: result.tx.data as Hex,
          value: BigInt(result.tx.value || "0"),
          gas: result.tx.gas ? BigInt(result.tx.gas) : undefined,
          gasPrice: result.tx.gasPrice ? BigInt(result.tx.gasPrice) : undefined,
        });
        await broadcast(serialized, row, true);
      }
      if (result.step === "sign-rfq") {
        const typed = parseTypedData(result.typedData);
        const signature = await walletClient.signTypedData({
          account: address,
          domain: typed.domain,
          types: typed.types,
          primaryType: typed.primaryType,
          message: typed.message,
        } as never);
        const sent = await fetch("/api/rfq", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: confirm.requestId,
            userSignature: signature,
            vendor: result.vendor,
            quoteId: result.quoteId,
            signingScheme: result.signingScheme,
            tape: row,
          }),
        });
        const body = (await sent.json()) as { ok: boolean; orderId?: string; message?: string; status?: string };
        if (!body.ok || !body.orderId) {
          await remember({ ...row, status: "failed", errorText: body.message || "RFQ submit failed" });
          setLocalError(body.message || "RFQ submit failed");
          return;
        }
        setBusy("Polling the RFQ");
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusRes = await fetch(`/api/rfq?orderId=${body.orderId}`);
          const statusBody = (await statusRes.json()) as { order?: { status?: string; txHash?: string } };
          const status = statusBody.order?.status || "pending";
          if (["FILLED", "FAILED", "EXPIRED", "CANCELLED"].includes(status)) {
            await remember({
              ...row,
              status: status === "FILLED" ? "filled" : `Failed ${status}`,
              orderId: body.orderId,
              txHash: statusBody.order?.txHash,
            });
            break;
          }
        }
        closeConfirm();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLocalError(message);
      await remember({ ...row, status: "failed", errorText: message });
    } finally {
      setBusy(null);
    }
  }

  const simLine = result?.step === "sign-swap" ? describeSimulation(result.simulation, address, quote) : null;
  const reason =
    localError ||
    confirm.note ||
    (result?.step === "rejected" ? result.message : undefined) ||
    (result?.step === "expired" ? COPY.quoteExpired : undefined) ||
    (result?.step === "sign-swap" && result.simulateStatus === "FAILED" ? plainSimulate(result.simulateReason || "") : undefined) ||
    (expired ? COPY.quoteExpired : undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080A]/88 p-4">
      <section className="w-full max-w-xl border border-line bg-bg p-8 md:p-10">
        <p className="kicker">{confirm.side === "buy" ? "You are buying" : "You are selling"}</p>
        <h2 className="display mt-3 text-4xl md:text-5xl">{underlyingName(ticker)} exposure</h2>
        <p className="mt-4 text-sm">
          Rail locked: {quote.wrapper.symbol} · {quote.wrapper.rail === "bStock" ? "bStocks" : quote.wrapper.rail === "ondo" ? "Ondo" : "xStocks"} ·{" "}
          {quote.executionMode || "—"}
          {quote.vendorName ? ` · ${quote.vendorName}` : ""}
        </p>
        <p className="num mt-2 text-lg">
          {confirm.side === "buy" ? "Spend" : "Sell about"} {Number(confirm.usdt).toFixed(2)} USDT
        </p>
        {result?.step === "sign-rfq" ? (
          <p className="mt-4 text-sm text-dim">RFQ · you sign typed data · we submit · we poll. Quoted out ~{qty} {quote.wrapper.symbol}.</p>
        ) : result?.step === "approve" ? (
          <p className="mt-4 text-sm">Allowance is short. Sign the approve, then the swap quotes again.</p>
        ) : (
          <p className="num mt-4 text-sm">
            Simulate: {simLine || (confirm.preparing ? "running" : "—")}
            {result?.step === "sign-swap" ? ` · ${result.simulateStatus}` : ""}
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Ring left={left} />
          <p className="num text-sm">{expired ? COPY.quoteExpired : `Quote dies in ${formatLeft(left)}`}</p>
        </div>
        {reason ? <p className="mt-4 text-sm text-down">{reason}</p> : null}
        {busy ? <p className="mt-2 text-sm text-dim">{busy}</p> : null}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <button disabled={signOff || result?.step === "approve" && expired} className="h-12 bg-gold text-xs tracking-[0.2em] text-bg disabled:opacity-40" onClick={() => void onSign()}>
            {result?.step === "approve" ? "APPROVE" : "SIGN"}
          </button>
          <button className="h-12 border border-line text-xs tracking-[0.2em]" onClick={() => void requoteConfirm()} disabled={confirm.preparing}>
            REQUOTE
          </button>
          <button className="h-12 border border-line text-xs tracking-[0.2em]" onClick={closeConfirm}>
            CANCEL
          </button>
        </div>
        <button className="sr-only" onClick={() => setConfirmResult(result)}>
          hold
        </button>
      </section>
    </div>
  );
}

function Ring({ left }: { left: number }) {
  const pct = Math.max(0, Math.min(1, left / 30_000));
  return (
    <span
      className="inline-block h-10 w-10 rounded-full"
      style={{ background: `conic-gradient(#F0B90B ${pct * 360}deg, #1A1D24 0deg)` }}
      aria-hidden
    />
  );
}

function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `00:${String(s).padStart(2, "0")}`;
}

function describeSimulation(simulation: unknown, wallet?: string, quote?: { wrapper: { symbol: string; decimals: number; address: string } }): string {
  const body = simulation && typeof simulation === "object" ? (simulation as { balanceChanges?: Array<{ owner?: string; contractAddress?: string; change?: string }> }) : {};
  const rows = (body.balanceChanges || []).filter((row) => !wallet || row.owner?.toLowerCase() === wallet.toLowerCase());
  if (!rows.length || !quote) return "no balance change returned";
  return rows
    .map((row) => {
      const known =
        row.contractAddress?.toLowerCase() === quote.wrapper.address.toLowerCase()
          ? quote.wrapper
          : Object.values(QUOTE_ASSETS).find((asset) => asset.address.toLowerCase() === row.contractAddress?.toLowerCase());
      const decimals = known && "decimals" in known ? known.decimals : 18;
      const symbol = known && "symbol" in known ? known.symbol : "units";
      const amount = fromBaseUnits(String(row.change || "0"), decimals);
      return `${amount > 0 ? "+" : ""}${formatQty(amount)} ${symbol}`;
    })
    .join(" · ");
}
