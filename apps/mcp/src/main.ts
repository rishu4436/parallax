import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readEnv } from "@parallax/config";
import { adviseDesk, cashSession, deskSignals, evaluatePolicy, issuePassport, passportFromBook, policyPublic, referenceFromBook, resolveQuery, strategyPlan, weekendBrief, type Intent, type VenueQuote } from "@parallax/core";
import { findPassport, readBeat, readFriday, readJobs, readSettings, readTape, spentTodayUsdt, writePassport } from "@parallax/core/persist";
import { prepareExecution, publicPrepare, quoteIntent, readBalances } from "@parallax/web3";

const server = new McpServer({ name: "parallax", version: "0.1.0" });

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

server.tool("parallax_resolve", "Map a name, ticker, or wrapper symbol to BSC rails.", { q: z.string() }, async ({ q }) => {
  return text(resolveQuery(q));
});

server.tool(
  "parallax_quote",
  "Live Binance Web3 quote for every BSC wrapper of a ticker.",
  {
    ticker: z.string(),
    usdt: z.string().default("10"),
    wallet: z.string().optional(),
    side: z.enum(["buy", "sell"]).default("buy"),
  },
  async ({ ticker, usdt, wallet, side }) => {
    const env = readEnv();
    const settings = readSettings();
    const intent: Intent = { ticker, usdt, side, wallet: (wallet || env.quoteWallet) as Intent["wallet"] };
    const book = await quoteIntent(intent, { slip: true, allowed: settings.allowedRails });
    const passport = passportFromBook({ intent, book, settings, spentToday: spentTodayUsdt(), source: "mcp", signer: intent.wallet });
    if (passport) writePassport(passport);
    return text({ ...book, passport, policy: passport?.gate ? policyPublic(passport.gate) : null });
  },
);

server.tool(
  "parallax_best",
  "Best open rail for a ticker. Does not sign.",
  { ticker: z.string(), usdt: z.string().default("10"), wallet: z.string().optional() },
  async ({ ticker, usdt, wallet }) => {
    const env = readEnv();
    const book = await quoteIntent(
      { ticker, usdt, side: "buy", wallet: (wallet || env.quoteWallet) as Intent["wallet"] },
      { slip: false, allowed: readSettings().allowedRails },
    );
    return text({
      best: book.best,
      fridayClose: book.fridayClose,
      fridayOpen: book.fridayOpen,
      fridayDate: book.fridayDate,
      priorClose: book.priorClose,
      priorOpen: book.priorOpen,
      priorDate: book.priorDate,
      sessionOpen: book.sessionOpen,
      sessionOpenDate: book.sessionOpenDate,
      ms: book.ms,
    });
  },
);

server.tool(
  "parallax_simulate",
  "Build and simulate a locked rail. Does not sign or broadcast.",
  {
    ticker: z.string(),
    side: z.enum(["buy", "sell"]),
    usdt: z.string(),
    wallet: z.string(),
    rail: z.enum(["bStock", "ondo", "xStock"]).optional(),
  },
  async ({ ticker, side, usdt, wallet, rail }) => {
    const intent: Intent = { ticker, side, usdt, wallet: wallet as Intent["wallet"], railLock: rail };
    const book = await quoteIntent(intent, { slip: false, allowed: readSettings().allowedRails });
    const quote: VenueQuote | undefined = (rail ? book.books.find((item) => item.wrapper.rail === rail)?.best : book.best?.best) ?? undefined;
    if (!quote) return text({ ok: false, message: "No open route", books: book.books });
    const settings = readSettings();
    const spentToday = spentTodayUsdt();
    const locked = { ...intent, railLock: quote.wrapper.rail };
    const prepared = await prepareExecution({
      intent: locked,
      quote,
      settings,
      spentToday,
      source: "mcp",
      reference: referenceFromBook(book),
    });
    const liveQuote = "quote" in prepared && prepared.quote ? prepared.quote : quote;
    const passport = issuePassport({
      intent: locked,
      quote: liveQuote,
      underlying: { ticker: book.underlying.ticker, name: book.underlying.name },
      reference: referenceFromBook(book),
      settings,
      spentToday,
      prepare: prepared,
      source: "mcp",
      signer: locked.wallet,
    });
    writePassport(passport);
    return text({
      ok: prepared.step !== "rejected" && prepared.step !== "expired",
      ...publicPrepare(prepared),
      passport,
      policy: passport.gate ? policyPublic(passport.gate) : null,
    });
  },
);

server.tool(
  "parallax_passport",
  "ExecutionPassport for a live quote or a stored hash. Does not sign.",
  {
    hash: z.string().optional(),
    ticker: z.string().optional(),
    usdt: z.string().default("10"),
    wallet: z.string().optional(),
    side: z.enum(["buy", "sell"]).default("buy"),
  },
  async ({ hash, ticker, usdt, wallet, side }) => {
    if (hash) return text(findPassport(hash) ?? { ok: false, message: "Passport not found" });
    if (!ticker) return text({ ok: false, message: "hash or ticker is required" });
    const env = readEnv();
    const settings = readSettings();
    const intent: Intent = { ticker, usdt, side, wallet: (wallet || env.quoteWallet) as Intent["wallet"] };
    const book = await quoteIntent(intent, { slip: true, allowed: settings.allowedRails });
    const passport = passportFromBook({ intent, book, settings, spentToday: spentTodayUsdt(), source: "mcp", signer: intent.wallet });
    if (passport) writePassport(passport);
    return text(passport ?? { ok: false, message: "No quote to passport" });
  },
);

server.tool(
  "parallax_policy",
  "Evaluate a proposed execution against PolicyEngine. Does not sign.",
  {
    ticker: z.string(),
    side: z.enum(["buy", "sell"]).default("buy"),
    usdt: z.string().default("10"),
    wallet: z.string().optional(),
    rail: z.enum(["bStock", "ondo", "xStock"]).optional(),
    mode: z.enum(["preview", "execute"]).default("preview"),
  },
  async ({ ticker, side, usdt, wallet, rail, mode }) => {
    const env = readEnv();
    const settings = readSettings();
    const intent: Intent = {
      ticker,
      side,
      usdt,
      wallet: (wallet || env.quoteWallet) as Intent["wallet"],
      railLock: rail,
    };
    const book = await quoteIntent(intent, { slip: true, allowed: settings.allowedRails });
    const quote: VenueQuote | undefined = (rail ? book.books.find((item) => item.wrapper.rail === rail)?.best : book.best?.best) ?? undefined;
    const decision = evaluatePolicy({
      source: "mcp",
      mode,
      intent,
      settings,
      spentToday: spentTodayUsdt(),
      quote,
      signer: intent.wallet,
      reference: referenceFromBook(book),
    });
    return text({ ok: true, policy: policyPublic(decision), quote: quote ?? null });
  },
);

server.tool(
  "parallax_advise",
  "Live strategy advice for a ticker from the current quote book. Does not sign.",
  { ticker: z.string(), usdt: z.string().default("10"), wallet: z.string().optional() },
  async ({ ticker, usdt, wallet }) => {
    const env = readEnv();
    const session = cashSession();
    const book = await quoteIntent(
      { ticker, usdt, side: "buy", wallet: (wallet || env.quoteWallet) as Intent["wallet"] },
      { slip: true, allowed: readSettings().allowedRails },
    );
    const jobs = readJobs();
    const settings = readSettings();
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
    return text({
      ticker: book.underlying.ticker,
      session: { kind: session.kind, atmosphere: session.atmosphere, chip: session.chip },
      fridayClose: book.fridayClose,
      fridayDate: book.fridayDate,
      priorClose: book.priorClose,
      priorOpen: book.priorOpen,
      priorDate: book.priorDate,
      sessionOpen: book.sessionOpen,
      sessionOpenDate: book.sessionOpenDate,
      best: book.best,
      advice,
      plan,
    });
  },
);

server.tool("parallax_status", "Tape row or recent tape.", { id: z.string().optional() }, async ({ id }) => {
  const tape = readTape();
  return text(id ? tape.find((row) => row.id === id || row.txHash === id || row.orderId === id) || null : tape);
});

server.tool("parallax_portfolio", "On-chain balances for a BSC wallet.", { wallet: z.string() }, async ({ wallet }) => {
  return text(await readBalances(wallet as Intent["wallet"]));
});

server.tool("parallax_weekend_brief", "Session, Friday ref, and three brief lines.", { wallet: z.string().optional() }, async ({ wallet }) => {
  const session = cashSession();
  const balances = wallet ? await readBalances(wallet as Intent["wallet"]) : null;
  const holdings = (balances?.lines ?? [])
    .filter((line) => line.rail && line.amount > 0)
    .map((line) => ({ symbol: line.symbol, tradable: false, gapPct: null }));
  return text({
    session,
    friday: readFriday(),
    beat: readBeat(),
    brief: weekendBrief(session, holdings),
    portfolio: balances,
  });
});

const transport = new StdioServerTransport();
await server.connect(transport);
