import { readFileSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";
import { cashSession, fetchCashPrints, fridayPrintFromCash, getUnderlying, weekendBrief, wrapperList, type HoldingGap } from "@parallax/core";
import {
  readArmed,
  readBeat,
  readFills,
  readFriday,
  readJobs,
  readQueue,
  readSettings,
  readTape,
  readWorkerEnabled,
  spentTodayUsdt,
  writeFriday,
} from "@parallax/core/persist";
import { fetchMarketPrint, readBalances } from "@parallax/web3";
import { fail } from "@/lib/http";

async function studioStatus(): Promise<{ live: boolean; address: string }> {
  let live = false;
  try {
    const ping = await fetch("http://127.0.0.1:9000/ping", { signal: AbortSignal.timeout(800) });
    live = ping.ok;
  } catch {
    live = false;
  }
  let address = "";
  try {
    const toml = readFileSync(path.resolve(process.cwd(), "../../parallaxagent/app/agent/studio.toml"), "utf8");
    address = toml.match(/^\s*address\s*=\s*"(0x[a-fA-F0-9]{40})"/m)?.[1] || "";
  } catch {
    address = "";
  }
  return { live, address };
}

export async function GET(request: Request) {
  try {
    const wallet = new URL(request.url).searchParams.get("wallet") as `0x${string}` | null;
    const ticker = new URL(request.url).searchParams.get("ticker") || "NVDA";
    const session = cashSession();
    let friday = readFriday()[ticker] ?? null;
    if (!friday || friday.priorClose == null) {
      const cash = await fetchCashPrints(ticker).catch(() => null);
      const print = cash ? fridayPrintFromCash(ticker, cash) : null;
      if (print) {
        friday = print;
        writeFriday(ticker, friday);
      }
    }
    let live: {
      perShare: number | null;
      symbol: string;
      isMarketOpen: boolean;
      stockPrice: number | null;
      volume: number;
    } | null = null;
    try {
      const underlying = getUnderlying(ticker);
      const wrapper = underlying
        ? wrapperList(underlying).find((item) => item.rail === "bStock") || wrapperList(underlying)[0]
        : undefined;
      if (wrapper) {
        const print = await fetchMarketPrint(wrapper.address);
        live = {
          perShare: print.perShare,
          symbol: wrapper.symbol,
          isMarketOpen: print.isMarketOpen,
          stockPrice: print.stockPrice,
          volume: print.volume,
        };
      }
    } catch {
      live = null;
    }
    const studio = await studioStatus();
    const portfolio = wallet ? await readBalances(wallet) : null;
    const holdings: HoldingGap[] = (portfolio?.lines ?? [])
      .filter((line) => line.rail && line.amount > 0)
      .map((line) => ({ symbol: line.symbol, tradable: false, gapPct: null }));
    return Response.json({
      ok: true,
      session,
      settings: readSettings(),
      spentToday: spentTodayUsdt(),
      jobs: readJobs(),
      tape: readTape(),
      beat: readBeat(),
      studio,
      queue: readQueue(),
      friday,
      portfolio,
      brief: weekendBrief(session, holdings),
      identity: readEnv().agentId,
      live,
      armed: readArmed(),
      workerEnabled: readWorkerEnabled(),
      fills: readFills(),
    });
  } catch (err) {
    return fail(err);
  }
}
