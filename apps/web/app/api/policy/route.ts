import {
  evaluatePolicy,
  policyPublic,
  type Intent,
  type PolicyMode,
  type PolicySource,
  type VenueQuote,
} from "@parallax/core";
import { readSettings, spentTodayUsdt } from "@parallax/core/persist";
import { fail, readJson } from "@/lib/http";

const SOURCES: PolicySource[] = ["ui", "strategy", "agentic", "mcp", "studio"];
const MODES: PolicyMode[] = ["preview", "execute"];

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      source?: PolicySource;
      mode?: PolicyMode;
      intent: Intent;
      quote?: VenueQuote | null;
      signer?: string | null;
      liquidity?: number;
      simulateStatus?: "SUCCESS" | "FAILED" | "PENDING" | "NONE";
      simulateReason?: string;
      prepareStep?: "rejected" | "expired" | "approve" | "sign-rfq" | "sign-swap";
      requireSimulation?: boolean;
      reference?: { price: number | null; label?: string };
    }>(request);
    if (!body.intent?.ticker || !body.intent.usdt || !body.intent.wallet) {
      return Response.json({ ok: false, message: "intent.ticker, intent.usdt, and intent.wallet are required" }, { status: 400 });
    }
    const source = SOURCES.includes(body.source as PolicySource) ? (body.source as PolicySource) : "ui";
    const mode = MODES.includes(body.mode as PolicyMode) ? (body.mode as PolicyMode) : "preview";
    const decision = evaluatePolicy({
      source,
      mode,
      intent: body.intent,
      settings: readSettings(),
      spentToday: spentTodayUsdt(),
      quote: body.quote,
      signer: body.signer ?? body.intent.wallet,
      liquidity: body.liquidity,
      simulateStatus: body.simulateStatus,
      simulateReason: body.simulateReason,
      prepareStep: body.prepareStep,
      requireSimulation: body.requireSimulation,
      reference: body.reference,
    });
    return Response.json({ ok: true, policy: policyPublic(decision) });
  } catch (err) {
    return fail(err);
  }
}
