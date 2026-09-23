/**
 * PARALLAX work hook. Code reads the live BSC router and writes the
 * deliverable. Studio's signing.ts remains the only signer.
 */

const base = () => (process.env.PARALLAX_BASE || "http://127.0.0.1:3020").replace(/\/$/, "");

export interface ParallaxAsk {
  ticker: string;
  usdt: string;
  kind: "quote" | "best" | "weekend" | "advise";
}

export function parseParallaxPrompt(prompt: string): ParallaxAsk {
  const trimmed = prompt.trim();
  if (trimmed.startsWith("{")) {
    try {
      const job = JSON.parse(trimmed) as {
        type?: string;
        action?: string;
        ticker?: string;
        usdt?: string;
        spec?: { type?: string; ticker?: string; tickers?: string[]; usdtEach?: string; maxUsdt?: string; usdtAdd?: string };
      };
      const spec = job.spec ?? {};
      const ticker = String(spec.ticker || spec.tickers?.[0] || job.ticker || "NVDA").toUpperCase();
      const usdt = String(spec.usdtEach || spec.maxUsdt || spec.usdtAdd || job.usdt || "10");
      const type = spec.type || job.type || job.action || "";
      const kind =
        type === "weekend_cap" || type === "weekend"
          ? "weekend"
          : type === "best"
            ? "best"
            : /strateg|advise|cheap_rail|gap_fade|open_print|dca|flatten/i.test(type)
              ? "advise"
              : "quote";
      return { ticker, usdt, kind };
    } catch {
      /* plain text below */
    }
  }
  if (/weekend/i.test(trimmed)) return { ticker: tickerOf(trimmed), usdt: "10", kind: "weekend" };
  if (/strateg|advise|\bplan\b/i.test(trimmed)) return { ticker: tickerOf(trimmed), usdt: amountOf(trimmed), kind: "advise" };
  if (/\bbest\b/i.test(trimmed)) return { ticker: tickerOf(trimmed), usdt: amountOf(trimmed), kind: "best" };
  return { ticker: tickerOf(trimmed), usdt: amountOf(trimmed), kind: "quote" };
}

function tickerOf(text: string): string {
  const named = text.match(/\b(NVDA|TSLA|AAPL|AMZN|MSFT|META|GOOGL|AMD|QQQ|SPY|CRCL)\b/i);
  return (named?.[1] || "NVDA").toUpperCase();
}

function amountOf(text: string): string {
  const amount = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return amount?.[1] || "10";
}

export async function parallaxDeliverable(prompt: string): Promise<string> {
  const ask = parseParallaxPrompt(prompt);
  const root = base();
  if (ask.kind === "weekend") {
    const res = await fetch(`${root}/api/desk?ticker=${encodeURIComponent(ask.ticker)}`);
    const body = (await res.json()) as { brief?: string[]; session?: { chip?: string }; friday?: { close?: number } | null; message?: string };
    if (!res.ok) return `PARALLAX desk failed: ${body.message || res.status}`;
    return [
      "PARALLAX weekend",
      body.session?.chip || "session unread",
      body.friday?.close ? `Friday close ${body.friday.close}` : "Friday ref unavailable",
      ...(body.brief || []),
      "No transaction was signed.",
    ].join("\n");
  }
  const res = await fetch(`${root}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticker: ask.ticker, usdt: ask.usdt, side: "buy" }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    message?: string;
    advice?: Array<{ name?: string; status?: string; headline?: string; reason?: string }>;
    plan?: { headline?: string; steps?: Array<{ state?: string; title?: string; detail?: string }> };
    book?: {
      fridayClose?: number | null;
      fridayDate?: string | null;
      priorClose?: number | null;
      priorOpen?: number | null;
      priorDate?: string | null;
      sessionOpen?: number | null;
      sessionOpenDate?: string | null;
      best?: { wrapper?: { symbol?: string }; best?: { vendorName?: string; perShare?: number; executionMode?: string } };
      books?: Array<{ status?: string; errorText?: string; wrapper?: { symbol?: string; rail?: string }; best?: { ok?: boolean; executionMode?: string; vendorName?: string; perShare?: number } }>;
    };
  };
  if (!body.ok || !body.book) return `PARALLAX quote failed: ${body.message || "the desk API did not answer"}`;
  const rows = (body.book.books || []).map((row) => {
    const quote = row.best;
    const price = quote?.ok && quote.perShare ? `$${quote.perShare.toFixed(2)}` : row.errorText || "—";
    return `${row.wrapper?.symbol || "?"}  ${row.status || "—"}  ${quote?.executionMode || "—"}  ${quote?.vendorName || "—"}  ${price}`;
  });
  const best = body.book.best;
  const headline =
    ask.kind === "best"
      ? `BEST ${best?.wrapper?.symbol || "none"}  ${best?.best?.vendorName || ""}  ${best?.best?.perShare ? `$${best.best.perShare.toFixed(2)}` : ""}`.trim()
      : ask.kind === "advise"
        ? `STRATEGIES ${ask.ticker}  ${ask.usdt} USDT`
        : `QUOTE ${ask.ticker}  ${ask.usdt} USDT`;
  const advice = (body.advice || []).filter((row) => ask.kind === "advise" || row.status === "fire" || row.status === "info");
  const adviceLines = advice.map((row) => `${row.name || "strategy"}  ${row.status || ""}  ${row.headline || row.reason || ""}`.trim());
  const planLines = body.plan?.steps?.map((step) => `${step.state || ""} · ${step.title || ""} · ${step.detail || ""}`.trim()) || [];
  return [
    headline,
    body.book.priorClose
      ? `Prior close${body.book.priorDate ? ` ${body.book.priorDate}` : ""} $${body.book.priorClose.toFixed(2)}`
      : "Prior cash close unavailable",
    body.book.priorOpen ? `Prior open $${body.book.priorOpen.toFixed(2)}` : null,
    body.book.sessionOpen
      ? `Session open${body.book.sessionOpenDate ? ` ${body.book.sessionOpenDate}` : ""} $${body.book.sessionOpen.toFixed(2)}`
      : null,
    body.book.fridayClose && body.book.fridayDate !== body.book.priorDate
      ? `Friday close $${body.book.fridayClose.toFixed(2)}`
      : body.book.priorClose
        ? null
        : body.book.fridayClose
          ? `Friday close $${body.book.fridayClose.toFixed(2)}`
          : "Friday ref unavailable",
    ...rows,
    ...(body.plan ? ["", "Plan", body.plan.headline || "", ...planLines] : []),
    ...(adviceLines.length && ask.kind === "advise" ? ["", "Advice", ...adviceLines] : []),
    "Jobs queue a signature. Studio signing.ts is the only signer. This deliverable is not a transaction.",
  ]
    .filter((line) => line != null)
    .join("\n");
}
