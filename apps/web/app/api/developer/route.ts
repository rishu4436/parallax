import { readDevex } from "@parallax/web3";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = readDevex().map((event) => ({
      at: event.at,
      path: event.path.split("?")[0],
      kind: event.kind,
      status: event.status,
      ttfbMs: event.ttfbMs,
      retries: event.retries,
      ok: event.ok,
      errorCode: event.errorCode,
      note: event.note,
    }));
    return Response.json({ ok: true, source: "devex_metrics", retained: 200, events });
  } catch (err) {
    return fail(err);
  }
}
