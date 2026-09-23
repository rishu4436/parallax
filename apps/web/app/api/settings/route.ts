import { parseSettings, type Settings } from "@parallax/core";
import { readSettings, writeSettings } from "@parallax/core/persist";
import { fail, readJson } from "@/lib/http";

export async function GET() {
  return Response.json({ ok: true, settings: readSettings() });
}

export async function POST(request: Request) {
  try {
    const next = parseSettings(await readJson<Partial<Settings>>(request));
    return Response.json({ ok: true, settings: writeSettings(next) });
  } catch (err) {
    return fail(err);
  }
}
