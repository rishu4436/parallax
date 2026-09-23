import { readSettings, spentTodayUsdt } from "@parallax/core/persist";
import { prepareExecution } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";
import type { Intent, VenueQuote } from "@parallax/core";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ intent: Intent; quote: VenueQuote }>(request);
    const result = await prepareExecution({
      intent: body.intent,
      quote: body.quote,
      settings: readSettings(),
      spentToday: spentTodayUsdt(),
    });
    return Response.json({ ok: result.step !== "rejected" && result.step !== "expired", ...result });
  } catch (err) {
    return fail(err);
  }
}
