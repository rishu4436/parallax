"use client";

import {
  formatPct,
  formatPx,
  formatTtl,
  shortPassportHash,
  type ExecutionPassport,
  type PassportState,
  type PolicyVerdict,
} from "@parallax/core";
import { StatusChip, type StatusTone } from "@/components/ui/status";
import { useParallax } from "@/lib/store";

function toneFor(state: PassportState): StatusTone {
  if (state === "ready" || state === "quoted") return "open";
  if (state === "incomplete" || state === "needs_approval") return "pending";
  if (state === "expired" || state === "rail_closed") return "closed";
  if (state === "offline") return "offline";
  return "failed";
}

function toneForVerdict(verdict: PolicyVerdict): StatusTone {
  if (verdict === "PASS") return "open";
  if (verdict === "WAIT") return "pending";
  if (verdict === "REQUOTE") return "closed";
  return "failed";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5">
      <dt className="text-dim">{label}</dt>
      <dd className="num text-ink">{value}</dd>
    </div>
  );
}

export function ExecutionPassportPanel() {
  const passport = useParallax((s) => s.passport);
  const quoting = useParallax((s) => s.quoting);
  const demo = useParallax((s) => s.demo);

  return (
    <section className="mt-4 border border-line px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="kicker">Execution passport</h2>
        <div className="flex flex-wrap items-center gap-2">
          {passport ? <StatusChip tone={toneFor(passport.state)}>{passport.state.replaceAll("_", " ")}</StatusChip> : null}
          {passport?.gate ? <StatusChip tone={toneForVerdict(passport.gate.verdict)}>{passport.gate.verdict}</StatusChip> : null}
        </div>
      </div>
      {!passport ? (
        <p className="mt-3 text-sm text-dim">{quoting ? "Issuing from the live quote." : "Quote a name. The passport is issued from the live book."}</p>
      ) : (
        <PassportBody passport={passport} />
      )}
      {demo ? <p className="mt-2 text-[10px] tracking-[0.16em] text-gold">DEMO DATA · the passport still comes from the live quote, not the overlay</p> : null}
    </section>
  );
}

export function PassportCompact({ passport }: { passport: ExecutionPassport }) {
  return (
    <p className="mt-3 num text-[11px] text-dim">
      Passport {passport.state} · {shortPassportHash(passport.hash)}
    </p>
  );
}

function money(value: number | null | undefined): string {
  return value == null ? "—" : formatPx(value);
}

function gasEstimate(body: ExecutionPassport["body"]): string {
  if (body.gasEstimateUsd != null) return formatPx(body.gasEstimateUsd);
  if (body.estimatedGasUnits) {
    return body.gasPrice ? `${body.estimatedGasUnits} units · ${body.gasPrice} wei` : `${body.estimatedGasUnits} units`;
  }
  return "—";
}

function PassportBody({ passport }: { passport: ExecutionPassport }) {
  const body = passport.body;
  const left = body.expiresAt - Date.now();

  return (
    <>
      <p className="num mt-3 break-all text-[11px] text-dim" title={passport.hash}>
        {passport.hash}
      </p>
      <p className="mt-2 text-sm">{passport.reason}</p>
      <dl className="mt-3 grid gap-0 text-xs">
        <Row label="Intent" value={`${body.intent.side.toUpperCase()} ${body.intent.usdt} USDT ${body.intent.ticker}`} />
        <Row label="Underlying" value={`${body.underlying.ticker} · ${body.underlying.name}`} />
        <Row label="Representation" value={`${body.representation.symbol} · ${body.representation.rail}`} />
        <Row label="Quote" value={body.quote.quoteId || (body.quote.ok ? "live" : body.quote.errorText || "—")} />
        <Row label="Vendor" value={body.vendor || "—"} />
        <Row label="Execution" value={body.executionMode || "—"} />
        <Row label="Requirement" value={body.executionRequirement.replaceAll("_", " ")} />
        <Row label="Quoted" value={new Date(body.quotedAt).toISOString()} />
        <Row label="Expiry" value={left <= 0 ? "expired" : formatTtl(left)} />
        <Row label="Reference" value={body.reference.price ? `${formatPx(body.reference.price)} · ${body.reference.label}` : body.reference.label} />
        <Row label="Multiplier" value={String(body.multiplier)} />
        <Row label="Network fee" value={money(body.networkFeeUsd)} />
        <Row label="Gas estimate" value={gasEstimate(body)} />
        <Row label="Price impact" value={body.priceImpactPct == null ? "—" : formatPct(body.priceImpactPct)} />
        <Row label="Trade fee" value={money(body.tradeFeeUsd)} />
        <Row
          label="Simulation"
          value={body.simulation.step ? `${body.simulation.status} · ${body.simulation.step}` : body.simulation.status}
        />
        <Row
          label="Policy"
          value={
            passport.gate
              ? `${passport.gate.verdict}${passport.gate.primary?.code ? ` · ${passport.gate.primary.code}` : ""}`
              : "—"
          }
        />
        {passport.commitment ? (
          <Row label="Signing commitment" value={`${passport.commitment.scheme} · ${shortPassportHash(passport.commitment.hash)}`} />
        ) : null}
        {passport.receipt ? (
          <Row
            label="Receipt"
            value={`${passport.receipt.status} · ${passport.receipt.txHash || passport.receipt.orderId || shortPassportHash(passport.receipt.hash)}`}
          />
        ) : null}
      </dl>
      {passport.gate?.primary ? (
        <p className="mt-3 text-sm text-down">
          {passport.gate.primary.human}
          {passport.gate.nextAction !== "none" && passport.gate.nextAction !== "sign"
            ? ` · ${passport.gate.nextAction.replaceAll("_", " ")}`
            : ""}
        </p>
      ) : null}
      <ul className="mt-3 space-y-1">
        {passport.gate
          ? passport.gate.checks.map((check) => (
              <li key={check.id} className={`text-[11px] ${check.pass ? "text-dim" : "text-down"}`}>
                <span className="num tracking-[0.12em]">{check.id.replaceAll("_", " ")}</span>
                <span className="ml-2">
                  {check.pass ? "pass" : `${check.failure?.code} · ${check.failure?.human}`}
                </span>
              </li>
            ))
          : body.policy.map((check) => (
              <li key={check.id} className={`text-[11px] ${check.pass ? "text-dim" : "text-down"}`}>
                <span className="num tracking-[0.12em]">{check.id.replaceAll("_", " ")}</span>
                <span className="ml-2">{check.detail}</span>
              </li>
            ))}
      </ul>
    </>
  );
}
