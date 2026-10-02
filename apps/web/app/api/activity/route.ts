import { readCommitments, readFills, readPassports, readReceipts, readTape } from "@parallax/core/persist";
import { fail } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      ok: true,
      tape: readTape(),
      fills: readFills(),
      passports: readPassports(),
      commitments: readCommitments(),
      receipts: readReceipts(),
    });
  } catch (err) {
    return fail(err);
  }
}
