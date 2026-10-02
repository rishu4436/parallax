import { CommitmentError, issueReceipt, type TapeRow } from "@parallax/core";
import { findPassport, requireSubmissionCommitment, upsertTape, writeReceipt } from "@parallax/core/persist";
import { assertSignedRfq, getRfqOrder, submitRfq } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      requestId: string;
      userSignature: string;
      vendor: string;
      quoteId: string;
      signingScheme?: string;
      typedData: string;
      tape: TapeRow;
    }>(request);
    if (!body.tape.passportHash) throw new CommitmentError("PASSPORT_MISSING", "RFQ submit requires an Execution Passport.");
    const passport = findPassport(body.tape.passportHash);
    if (!passport) throw new CommitmentError("PASSPORT_MISSING", "Execution Passport was not found.");
    if (passport.state === "expired" || Date.now() >= passport.body.expiresAt) {
      throw new CommitmentError("PASSPORT_EXPIRED", "That price is 30 seconds old. Requote.");
    }
    const commitment = requireSubmissionCommitment(passport.hash, body.tape.signingCommitmentHash);
    await assertSignedRfq({
      signature: body.userSignature,
      typedData: body.typedData,
      commitment,
      passportHash: passport.hash,
      expectedSigner: passport.body.intent.wallet,
      expiresAt: passport.body.expiresAt,
    });
    const sent = await submitRfq({
      requestId: body.requestId,
      userSignature: body.userSignature,
      vendor: body.vendor,
      quoteId: body.quoteId,
      signingScheme: body.signingScheme,
    });
    const data = (sent.data ?? {}) as { orderId?: string; status?: string };
    const receipt = issueReceipt({
      id: data.orderId || body.requestId,
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      orderId: data.orderId,
      status: "submitted",
      source: body.tape.source === "agent" ? "agentic" : "ui",
    });
    writeReceipt(receipt);
    upsertTape({
      ...body.tape,
      status: data.status || "submitted",
      orderId: data.orderId,
      passportHash: passport.hash,
      signingCommitmentHash: commitment.hash,
      receiptId: receipt.id,
    });
    return Response.json({ ok: true, orderId: data.orderId, status: data.status, receipt, raw: sent.raw });
  } catch (err) {
    return fail(err);
  }
}

export async function GET(request: Request) {
  try {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) return Response.json({ ok: false, message: "orderId required" });
    const status = await getRfqOrder(orderId);
    return Response.json({ ok: true, order: status.data, raw: status.raw });
  } catch (err) {
    return fail(err);
  }
}
