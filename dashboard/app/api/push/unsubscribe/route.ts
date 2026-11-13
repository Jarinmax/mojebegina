// Jarda — upozornění na naplánovaný hovor 1.0. Odhlášení odběru push
// notifikací (zařízení si to řekne samo, např. po klepnutí "Vypnout").
import { NextResponse } from "next/server";
import { removeSubscription } from "@/lib/data/pushSubscriptions";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });

function isSameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Nepovolený požadavek." }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Neplatný požadavek." }, 400);
  }

  try {
    const result = await removeSubscription(body);
    return result.ok ? json({ ok: true }) : json({ error: result.error }, 400);
  } catch (error) {
    if (error instanceof UnauthenticatedError) return json({ error: "Přihlaste se prosím znovu." }, 401);
    if (error instanceof ForbiddenError) return json({ error: "K upozorněním nemáte přístup." }, 403);
    console.error("Odhlášení upozornění selhalo", error);
    return json({ error: "Odhlášení se nepodařilo. Zkuste to prosím znovu." }, 500);
  }
}
