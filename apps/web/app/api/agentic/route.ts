import { BawError, runBaw } from "@/lib/baw";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AddressRow = { binanceChainId?: string; chainName?: string; address?: string };

function bscAddress(payload: unknown): string | null {
  const data = (payload as { data?: { addresses?: AddressRow[] } })?.data;
  const row = data?.addresses?.find((item) => item.binanceChainId === "56" || /bsc|bnb/i.test(item.chainName || ""));
  return row?.address || null;
}

export async function GET() {
  try {
    const status = (await runBaw(["wallet", "status", "--json"])) as { data?: { status?: string } };
    const connected = status.data?.status === "CONNECTED";
    let address: string | null = null;
    if (connected) {
      const listed = await runBaw(["wallet", "address", "--json"]);
      address = bscAddress(listed);
    }
    return Response.json({ ok: true, status: status.data?.status || "UNCONNECTED", address });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, status: "UNCONNECTED", message });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; qrCodeId?: string };
    if (body.action === "signin") {
      const result = await runBaw(["auth", "signin", "--json"]);
      return Response.json({ ok: true, ...(result as object) });
    }
    if (body.action === "verify") {
      if (!body.qrCodeId || !/^[0-9a-f-]{16,64}$/i.test(body.qrCodeId)) {
        return Response.json({ ok: false, message: "A sign-in code is required." });
      }
      const result = await runBaw(["auth", "verify", "--qrCodeId", body.qrCodeId, "--json"], 300_000);
      return Response.json({ ok: true, ...(result as object) });
    }
    if (body.action === "signout") {
      const result = await runBaw(["auth", "signout", "--json"]);
      return Response.json({ ok: true, ...(result as object) });
    }
    return Response.json({ ok: false, message: "Unknown agentic action." });
  } catch (err) {
    const message = err instanceof BawError ? err.message : err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, message, code: err instanceof BawError ? err.nameCode : undefined });
  }
}
