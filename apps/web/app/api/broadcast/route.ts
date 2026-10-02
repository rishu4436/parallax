import { findCommitmentByPassport, upsertTape, writeReceipt } from "@parallax/core/persist";
import { broadcastEvm, getBroadcastOrders, getSwapHistory } from "@parallax/web3";
import { issueReceipt, type TapeRow } from "@parallax/core";
import { fail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ signedTransaction: string; address: `0x${string}`; tape: TapeRow }>(request);
    const sent = await broadcastEvm(body.signedTransaction, body.address);
    const data = (sent.data ?? {}) as { txHash?: string; orderId?: string };
    const commitment = body.tape.passportHash ? findCommitmentByPassport(body.tape.passportHash) : undefined;
    const receipt =
      body.tape.passportHash
        ? issueReceipt({
            id: data.orderId || body.tape.id,
            passportHash: body.tape.passportHash,
            signingCommitmentHash: commitment?.hash ?? body.tape.signingCommitmentHash,
            txHash: data.txHash,
            orderId: data.orderId,
            status: data.txHash ? "submitted" : "failed",
            source: body.tape.source === "agent" ? "agentic" : "ui",
          })
        : undefined;
    if (receipt) writeReceipt(receipt);
    const row: TapeRow = {
      ...body.tape,
      status: data.txHash ? "submitted" : "failed",
      txHash: data.txHash,
      orderId: data.orderId,
      errorText: data.txHash ? undefined : "Broadcast returned no hash",
      signingCommitmentHash: receipt?.signingCommitmentHash ?? commitment?.hash ?? body.tape.signingCommitmentHash,
      receiptId: receipt?.id,
    };
    upsertTape(row);
    return Response.json({ ok: Boolean(data.txHash), txHash: data.txHash, orderId: data.orderId, receipt, raw: sent.raw });
  } catch (err) {
    return fail(err);
  }
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
