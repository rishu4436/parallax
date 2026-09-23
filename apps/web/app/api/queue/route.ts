import { clearQueueItem, readQueue } from "@parallax/core/persist";
import { fail, readJson } from "@/lib/http";

export async function GET() {
  return Response.json({ ok: true, queue: readQueue() });
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ id?: string }>(request);
    if (!body.id) return Response.json({ ok: false, message: "Queue id required." });
    clearQueueItem(body.id);
    return Response.json({ ok: true, queue: readQueue() });
  } catch (err) {
    return fail(err);
  }
}
