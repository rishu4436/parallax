import { findPassport } from "@parallax/core/persist";
import { fail } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const hash = new URL(request.url).searchParams.get("hash");
    if (!hash) return Response.json({ ok: false, message: "hash is required" }, { status: 400 });
    const passport = findPassport(hash);
    if (!passport) return Response.json({ ok: false, message: "Passport not found" }, { status: 404 });
    return Response.json({ ok: true, passport });
  } catch (err) {
    return fail(err);
  }
}
