import { readBeat, readFills } from "@parallax/core/persist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("snapshot") === "1") {
    return Response.json({ ok: true, fills: readFills(), beat: readBeat() });
  }
  const encoder = new TextEncoder();
  const state: { timer?: ReturnType<typeof setInterval> } = {};
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const payload = JSON.stringify({ fills: readFills(), beat: readBeat() });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };
      send();
      state.timer = setInterval(send, 2_000);
    },
    cancel() {
      if (state.timer) clearInterval(state.timer);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
