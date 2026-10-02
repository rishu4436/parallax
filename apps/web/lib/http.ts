import { isWeb3Error } from "@parallax/web3";

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function fail(err: unknown) {
  if (isWeb3Error(err)) {
    return Response.json({
      ok: false,
      code: err.code,
      message: `${err.code} ${err.message}`,
      body: err.body,
    });
  }
  const message = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "code" in err ? (err as { code?: unknown }).code : undefined;
  return Response.json({ ok: false, ...(typeof code === "string" ? { code } : {}), message });
}
