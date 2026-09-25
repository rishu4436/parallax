import { answerCopilot, parseCopilot, type OpportunityCard } from "@parallax/core";
import { fail, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      text?: string;
      cards?: OpportunityCard[];
      focus?: { ticker: string; netPct: number | null; symbol?: string };
    }>(request);
    const text = (body.text || "").trim();
    if (!text) return Response.json({ ok: false, message: "Ask a question against the live book." }, { status: 400 });
    let cards = Array.isArray(body.cards) ? body.cards : [];
    if (!cards.length) {
      const scan = await fetch(new URL("/api/scan", request.url), { cache: "no-store" });
      const scanned = (await scan.json()) as { ok?: boolean; cards?: OpportunityCard[] };
      cards = scanned.cards || [];
    }
    const intent = parseCopilot(text);
    const reply = answerCopilot(intent, cards, body.focus);
    return Response.json({ ok: true, intent, ...reply });
  } catch (err) {
    return fail(err);
  }
}
