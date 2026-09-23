import { upsertTape } from "@parallax/core/persist";
import { getRfqOrder, submitRfq } from "@parallax/web3";
import type { TapeRow } from "@parallax/core";
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
    upsertTape({
      ...body.tape,
      status: data.status || "submitted",
      orderId: data.orderId,
    });
    return Response.json({ ok: true, orderId: data.orderId, status: data.status, raw: sent.raw });
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
