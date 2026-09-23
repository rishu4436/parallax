import { readEnv } from "@parallax/config";
import { adviseDesk, cashSession, deskSignals, strategyPlan } from "@parallax/core";
import { readJobs, readSettings, spentTodayUsdt, writeFriday } from "@parallax/core/persist";
import { quoteIntent } from "@parallax/web3";
import { fail, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      ticker?: string;
      usdt?: string;
      side?: "buy" | "sell";
      wallet?: `0x${string}`;
      railLock?: "bStock" | "ondo" | "xStock";
    }>(request);
    const env = readEnv();
    const settings = readSettings();
    const book = await quoteIntent(
      {
        ticker: (body.ticker || "NVDA").toUpperCase(),
        usdt: body.usdt || "10",
        side: body.side === "sell" ? "sell" : "buy",
        wallet: body.wallet || env.quoteWallet,
        railLock: body.railLock,
      },
      { slip: true, allowed: settings.allowedRails },
    );
    if (book.fridayClose && book.fridayDate && book.fridaySource) {
      writeFriday(book.underlying.ticker, {
        ticker: book.underlying.ticker,
        close: book.fridayClose,
        sessionDate: book.fridayDate,
        source: book.fridaySource,
        storedAt: Date.now(),
        open: book.fridayOpen ?? undefined,
        priorClose: book.priorClose ?? undefined,
        priorOpen: book.priorOpen ?? undefined,
        priorDate: book.priorDate ?? undefined,
        sessionOpen: book.sessionOpen ?? undefined,
        sessionOpenDate: book.sessionOpenDate ?? undefined,
      });
    }
    const session = cashSession();
    const jobs = readJobs();
    const signals = deskSignals({
      ticker: book.underlying.ticker,
      session,
      books: book.books,
      fridayClose: book.fridayClose,
      fridayOpen: book.fridayOpen,
      fridayDate: book.fridayDate,
      priorClose: book.priorClose,
      priorOpen: book.priorOpen,
      priorDate: book.priorDate,
      sessionOpen: book.sessionOpen,
      sessionOpenDate: book.sessionOpenDate,
    });
    const advice = adviseDesk(signals, jobs);
    const plan = strategyPlan({
      signals,
      jobs,
      orderCapUsdt: settings.orderCapUsdt,
      dailyCapUsdt: settings.dailyCapUsdt,
      spentToday: spentTodayUsdt(),
    });
    return Response.json({ ok: true, book, advice, plan, session });
  } catch (err) {
    return fail(err);
  }
}
