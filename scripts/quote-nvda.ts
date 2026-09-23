import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readEnv } from "@parallax/config";
import { cashSession, formatPct, formatPx, formatQty, fromBaseUnits, refreshMultipliers } from "@parallax/core";
import { fetchAllRwaLists, isWeb3Error, quoteIntent } from "@parallax/web3";

const env = readEnv();
const wallet = env.quoteWallet;
const session = cashSession(new Date());

function cell(value: string, width: number): string {
  const text = value.length > width ? value.slice(0, width - 1) + "…" : value;
  return text.padEnd(width);
}

async function main() {
  const started = Date.now();
  console.log("PARALLAX  BSC mainnet  chain 56");
  console.log(`NY ${session.et.ymd} ${String(session.et.hour).padStart(2, "0")}:${String(session.et.minute).padStart(2, "0")} ET  ${session.kind}  ${session.chip}`);
  console.log(`wallet ${wallet}`);
  console.log(`base ${env.web3ApiBase}  key ${env.web3ApiKey ? "set" : "missing"}`);
  console.log("");

  try {
    const rows = await fetchAllRwaLists();
    const check = refreshMultipliers(rows);
    if (check.mismatches.length) {
      console.log("REGISTRY MISMATCH");
      for (const line of check.mismatches) console.log("  " + line);
    } else {
      console.log(`registry addresses match the live RWA list (${check.updated} multipliers refreshed)`);
    }
  } catch (err) {
    console.log("registry check failed: " + (err instanceof Error ? err.message : String(err)));
  }
  console.log("");

  const book = await quoteIntent(
    { ticker: "NVDA", side: "buy", usdt: "10", wallet },
    { slip: true },
  );

  const header = [
    cell("rail", 10),
    cell("symbol", 10),
    cell("mode", 10),
    cell("vendor", 14),
    cell("mid", 12),
    cell("out", 14),
    cell("slip50", 8),
    cell("slip500", 8),
    cell("status", 10),
    "detail",
  ].join(" ");
  console.log(header);
  console.log("-".repeat(header.length + 24));

  const captured: unknown[] = [];
  for (const row of book.books) {
    const routes = row.routes.length ? row.routes : [];
    if (!routes.length) continue;
    for (const route of routes) {
      const detail = route.ok
        ? `quoteId ${route.quoteId ?? "—"}`
        : `${route.errorCode ?? ""} ${route.errorText ?? ""}`.trim();
      const out = route.ok ? formatQty(fromBaseUnits(route.outAmount, route.wrapper.decimals)) : "—";
      console.log(
        [
          cell(row.wrapper.rail, 10),
          cell(row.wrapper.symbol, 10),
          cell(route.executionMode || row.badge, 10),
          cell(route.vendorName || "—", 14),
          cell(route.ok ? formatPx(route.perShare) : "—", 12),
          cell(out, 14),
          cell(route.slipKnown ? String(route.slipBps50) : "—", 8),
          cell(route.slipKnown ? String(route.slipBps500) : "—", 8),
          cell(row.status, 10),
          detail,
        ].join(" "),
      );
      if (!route.ok) captured.push({ symbol: row.wrapper.symbol, code: route.errorCode, body: route.raw });
    }
  }

  console.log("");
  if (book.best?.best) {
    console.log(
      `BEST ${book.best.wrapper.symbol}  ${book.best.best.vendorName ?? ""}  ${formatPx(book.best.best.perShare)} per share`,
    );
  } else {
    console.log("BEST none — every rail returned an error. No price was invented.");
  }
  if (book.priorClose) {
    console.log(`Prior cash close ${book.priorDate}  ${formatPx(book.priorClose)}  open ${book.priorOpen ? formatPx(book.priorOpen) : "—"}`);
    if (book.best?.best) {
      const gap = ((book.best.best.perShare - book.priorClose) / book.priorClose) * 100;
      console.log(`parallax vs prior close ${formatPct(gap)}`);
    }
  } else {
    console.log("Prior cash close unavailable");
  }
  if (book.sessionOpen) {
    console.log(`Session open ${book.sessionOpenDate}  ${formatPx(book.sessionOpen)}`);
  }
  if (book.fridayClose) {
    console.log(`Friday cash close ${book.fridayDate}  ${formatPx(book.fridayClose)}  via ${book.fridaySource}`);
    if (book.best?.best && book.fridayDate !== book.priorDate) {
      const gap = ((book.best.best.perShare - book.fridayClose) / book.fridayClose) * 100;
      console.log(`parallax vs Friday ${formatPct(gap)}`);
    }
  } else {
    console.log("Friday ref unavailable");
  }
  console.log(`quote book ${book.ms} ms  total ${Date.now() - started} ms`);

  if (captured.length) {
    const dir = path.resolve("docs/live-errors");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `quote-nvda-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(captured, null, 2));
    console.log(`error bodies ${file}`);
  }
}

main().catch((err) => {
  if (isWeb3Error(err)) {
    console.log(`${err.code} ${err.message}`);
    console.log(JSON.stringify(err.body, null, 2));
  } else {
    console.error(err instanceof Error ? err.stack : err);
  }
  process.exit(1);
});
