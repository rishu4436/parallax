import { fetchKline } from "@parallax/web3";
import { fail } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const address = new URL(request.url).searchParams.get("address");
    if (!address) return Response.json({ ok: false, message: "address required" });
    const candles = await fetchKline(address);
    return Response.json({ ok: true, candles });
  } catch (err) {
    return fail(err);
  }
}
