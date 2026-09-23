import { readTape, upsertTape } from "@parallax/core/persist";
import type { TapeRow } from "@parallax/core";
import { fail, readJson } from "@/lib/http";

export async function GET() {
  return Response.json({ ok: true, tape: readTape() });
}

export async function POST(request: Request) {
  try {
    const row = await readJson<TapeRow>(request);
    return Response.json({ ok: true, tape: upsertTape(row) });
  } catch (err) {
    return fail(err);
  }
}
