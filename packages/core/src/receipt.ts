import { canonicalHash } from "./canonical";
import type { PolicySource } from "./policy";

export const RECEIPT_STATUSES = ["submitted", "filled", "failed", "expired", "cancelled", "skipped"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface ExecutionReceipt {
  id: string;
  hash: string;
  passportHash: string;
  signingCommitmentHash: string | null;
  txHash?: string;
  orderId?: string;
  submittedAt: number;
  filledAt?: number;
  actualOutput?: string | null;
  realizedSlippageBps?: number | null;
  status: ReceiptStatus;
  source: PolicySource;
  note?: string;
}

export function issueReceipt(input: {
  id: string;
  passportHash: string;
  signingCommitmentHash?: string | null;
  txHash?: string;
  orderId?: string;
  submittedAt?: number;
  filledAt?: number;
  actualOutput?: string | null;
  realizedSlippageBps?: number | null;
  status: ReceiptStatus;
  source: PolicySource;
  note?: string;
}): ExecutionReceipt {
  const submittedAt = input.submittedAt ?? Date.now();
  const body = {
    id: input.id,
    passportHash: input.passportHash,
    signingCommitmentHash: input.signingCommitmentHash ?? null,
    ...(input.txHash ? { txHash: input.txHash } : {}),
    ...(input.orderId ? { orderId: input.orderId } : {}),
    submittedAt,
    ...(input.filledAt ? { filledAt: input.filledAt } : {}),
    actualOutput: input.actualOutput ?? null,
    realizedSlippageBps: input.realizedSlippageBps ?? null,
    status: input.status,
    source: input.source,
    ...(input.note ? { note: input.note } : {}),
  };
  return { ...body, hash: canonicalHash(body) };
}

export function receiptStatusFromSend(input: {
  note: string;
  done: boolean;
  pending: boolean;
  txHash?: string;
  orderId?: string;
}): ReceiptStatus {
  if (input.note.toLowerCase().includes("failed")) return "failed";
  if (input.done) return "filled";
  if (input.txHash || input.orderId) return "submitted";
  if (input.pending) return "skipped";
  return "skipped";
}

export function receiptStatusFromTape(status: string): ReceiptStatus | null {
  const value = status.toLowerCase();
  if (value === "filled") return "filled";
  if (value.includes("failed")) return "failed";
  if (value.includes("expired")) return "expired";
  if (value.includes("cancel")) return "cancelled";
  if (value === "submitted" || value === "signing" || value === "pending") return "submitted";
  if (value === "skipped") return "skipped";
  return null;
}

export function updateReceipt(
  existing: ExecutionReceipt,
  patch: Partial<Pick<ExecutionReceipt, "txHash" | "orderId" | "filledAt" | "actualOutput" | "realizedSlippageBps" | "status" | "note">>,
): ExecutionReceipt {
  return issueReceipt({
    id: existing.id,
    passportHash: existing.passportHash,
    signingCommitmentHash: existing.signingCommitmentHash,
    txHash: patch.txHash ?? existing.txHash,
    orderId: patch.orderId ?? existing.orderId,
    submittedAt: existing.submittedAt,
    filledAt: patch.filledAt ?? existing.filledAt,
    actualOutput: patch.actualOutput === undefined ? existing.actualOutput : patch.actualOutput,
    realizedSlippageBps: patch.realizedSlippageBps === undefined ? existing.realizedSlippageBps : patch.realizedSlippageBps,
    status: patch.status ?? existing.status,
    source: existing.source,
    note: patch.note ?? existing.note,
  });
}
