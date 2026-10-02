import { CommitmentError, issueReceipt, type TapeRow } from "@parallax/core";
import { findPassport, requireSubmissionCommitment, upsertTape, writeReceipt } from "@parallax/core/persist";
import { assertSignedEvm, broadcastEvm, getBroadcastOrders, getSwapHistory } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ signedTransaction: string; address: `0x${string}`; tape: TapeRow }>(request);
    if (!body.tape.passportHash) throw new CommitmentError("PASSPORT_MISSING", "Broadcast requires an Execution Passport.");
    const passport = findPassport(body.tape.passportHash);
    if (!passport) throw new CommitmentError("PASSPORT_MISSING", "Execution Passport was not found.");
    if (passport.state === "expired" || Date.now() >= passport.body.expiresAt) {
      throw new CommitmentError("PASSPORT_EXPIRED", "That price is 30 seconds old. Requote.");
    }
    const commitment = requireSubmissionCommitment(passport.hash, body.tape.signingCommitmentHash);
    if (hex(body.address) !== hex(passport.body.intent.wallet)) {
      throw new CommitmentError("WRONG_SIGNER", "Broadcast address does not match the passport wallet.");
    }
    await assertSignedEvm({
      signedTransaction: body.signedTransaction,
      commitment,
      passportHash: passport.hash,
      expectedSigner: passport.body.intent.wallet,
      expiresAt: passport.body.expiresAt,
    });
    const sent = await broadcastEvm(body.signedTransaction, body.address);
    const data = (sent.data ?? {}) as { txHash?: string; orderId?: string };
    const receipt = issueReceipt({
      id: data.orderId || body.tape.id,
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      txHash: data.txHash,
      orderId: data.orderId,
      status: data.txHash ? "submitted" : "failed",
      source: body.tape.source === "agent" ? "agentic" : "ui",
    });
    writeReceipt(receipt);
    const row: TapeRow = {
      ...body.tape,
      status: data.txHash ? "submitted" : "failed",
      txHash: data.txHash,
      orderId: data.orderId,
      errorText: data.txHash ? undefined : "Broadcast returned no hash",
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      receiptId: receipt.id,
    };
    upsertTape(row);
    return Response.json({ ok: Boolean(data.txHash), txHash: data.txHash, orderId: data.orderId, receipt, raw: sent.raw });
  } catch (err) {
    return fail(err);
  }
}

function hex(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const txHash = url.searchParams.get("txHash");
    const address = url.searchParams.get("address");
    const orderId = url.searchParams.get("orderId") || undefined;
    if (txHash) {
      const history = await getSwapHistory(txHash);
      return Response.json({ ok: true, history: history.data });
    }
    if (address) {
      const orders = await getBroadcastOrders(address, orderId);
      return Response.json({ ok: true, orders: orders.data });
    }
    return Response.json({ ok: false, message: "txHash or address required" });
  } catch (err) {
    return fail(err);
  }
}
