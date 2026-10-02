import { findCommitmentByPassport, upsertTape, writeReceipt } from "@parallax/core/persist";
import { getRfqOrder, submitRfq } from "@parallax/web3";
import { issueReceipt, type TapeRow } from "@parallax/core";
import { fail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      requestId: string;
      userSignature: string;
      vendor: string;
      quoteId: string;
      signingScheme?: string;
      tape: TapeRow;
    }>(request);
    const sent = await submitRfq({
      requestId: body.requestId,
      userSignature: body.userSignature,
      vendor: body.vendor,
      quoteId: body.quoteId,
      signingScheme: body.signingScheme,
    });
    const data = (sent.data ?? {}) as { orderId?: string; status?: string };
    const commitment = body.tape.passportHash ? findCommitmentByPassport(body.tape.passportHash) : undefined;
    const receipt =
      body.tape.passportHash
        ? issueReceipt({
            id: data.orderId || body.requestId,
            passportHash: body.tape.passportHash,
            signingCommitmentHash: commitment?.hash ?? body.tape.signingCommitmentHash,
            orderId: data.orderId,
            status: "submitted",
            source: body.tape.source === "agent" ? "agentic" : "ui",
          })
        : undefined;
    if (receipt) writeReceipt(receipt);
    upsertTape({
      ...body.tape,
      status: data.status || "submitted",
      orderId: data.orderId,
      signingCommitmentHash: receipt?.signingCommitmentHash ?? commitment?.hash ?? body.tape.signingCommitmentHash,
      receiptId: receipt?.id,
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
