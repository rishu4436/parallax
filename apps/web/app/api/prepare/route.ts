import { getUnderlying, issuePassport, policyPublic, sourceFromActor } from "@parallax/core";
import { readFriday, readSettings, spentTodayUsdt, writePassport } from "@parallax/core/persist";
import { prepareExecution } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";
import type { Intent, VenueQuote } from "@parallax/core";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ intent: Intent; quote: VenueQuote }>(request);
    const settings = readSettings();
    const spentToday = spentTodayUsdt();
    const source = sourceFromActor(body.intent.actor, "ui");
    const underlying = getUnderlying(body.intent.ticker);
    const print = readFriday()[body.intent.ticker];
    const reference =
      print?.priorClose && print.priorClose > 0
        ? { price: print.priorClose, label: "prior cash close" }
        : print?.close && print.close > 0
          ? { price: print.close, label: "Friday cash close" }
          : { price: null, label: "unavailable" };
    const result = await prepareExecution({
      intent: body.intent,
      quote: body.quote,
      settings,
      spentToday,
      source,
      reference,
    });
    const liveQuote = "quote" in result && result.quote ? result.quote : body.quote;
    const passport = issuePassport({
      intent: body.intent,
      quote: liveQuote,
      underlying: { ticker: underlying?.ticker || body.intent.ticker, name: underlying?.name || body.intent.ticker },
      reference,
      settings,
      spentToday,
      prepare: result,
      source,
      signer: body.intent.wallet,
    });
    writePassport(passport);
    return Response.json({
      ok: result.step !== "rejected" && result.step !== "expired",
      ...result,
      passport,
      policy: passport.gate ? policyPublic(passport.gate) : null,
    });
  } catch (err) {
    return fail(err);
  }
}
