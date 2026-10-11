// Security Phase 20 (Google Kalendář 1.0) — dokončení OAuth propojení.
// Čte flight state z httpOnly cookie zapsané v ../connect/route.ts a
// předává ji completeGoogleCalendarConnect (lib/data/googleCalendar.ts),
// která znovu NEZÁVISLE ověří state/userId/expiraci PŘED výměnou kódu za
// token — tahle route handler se nespoléhá jen na vlastní kontrolu.
// Cookie se smaže bez ohledu na výsledek (jednorázová, nikdy znovu
// použitelná).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeGoogleCalendarConnect, type OAuthFlightState } from "@/lib/data/googleCalendar";
import { FLIGHT_COOKIE } from "../connect/route";

const REDIRECT_TARGET = "/rizeni-firmy/obchod/dnes";

function redirectWithStatus(status: "connected" | "error", message?: string): NextResponse {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(REDIRECT_TARGET, base);
  url.searchParams.set("googleCalendar", status);
  if (message) url.searchParams.set("googleCalendarError", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FLIGHT_COOKIE)?.value;
  cookieStore.delete(FLIGHT_COOKIE);

  if (!raw) {
    return redirectWithStatus("error", "Propojení vypršelo, zkuste to prosím znovu.");
  }

  let flight: OAuthFlightState;
  try {
    flight = JSON.parse(raw);
  } catch {
    return redirectWithStatus("error", "Neplatný stav propojení.");
  }

  const { searchParams } = new URL(request.url);
  const returnedState = searchParams.get("state") ?? "";
  const code = searchParams.get("code") ?? "";
  if (!code) {
    return redirectWithStatus("error", "Google nevrátil autorizační kód.");
  }

  const result = await completeGoogleCalendarConnect(flight, returnedState, code);
  if (!result.ok) {
    return redirectWithStatus("error", result.error);
  }
  return redirectWithStatus("connected");
}
