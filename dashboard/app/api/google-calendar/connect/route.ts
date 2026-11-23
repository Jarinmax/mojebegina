// Security Phase 20 (Google Kalendář 1.0) — zahájení OAuth propojení.
// beginGoogleCalendarConnect sama vyžaduje requireGoogleCalendarConnectAccess
// (jen Blahoutův userId) — cizí uživatel dostane chybu dřív, než se
// cokoliv vygeneruje. state i PKCE code_verifier se ukládají do krátkodobé
// httpOnly cookie, ověřené znovu PŘI callbacku (lib/data/googleCalendar.ts:
// completeGoogleCalendarConnect) — tahle route handler cookii jen zapisuje,
// nic sama neověřuje napodruhé.
import { NextResponse } from "next/server";
import { getAppOrigin } from "@/lib/appOrigin";
import { cookies } from "next/headers";
import { beginGoogleCalendarConnect } from "@/lib/data/googleCalendar";
import { ForbiddenError, UnauthenticatedError } from "@/lib/data/errors";

export const FLIGHT_COOKIE = "google_calendar_oauth_flight";

// Návrat po propojení (?zpet=) — jen interní cesty v Řízení firmy.
function safeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/rizeni-firmy") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw.slice(0, 300);
}

export async function GET(request: Request) {
  try {
    const { url, flight } = await beginGoogleCalendarConnect();
    const returnTo = safeReturnTo(new URL(request.url).searchParams.get("zpet"));

    const cookieStore = await cookies();
    cookieStore.set(FLIGHT_COOKIE, JSON.stringify({ ...flight, returnTo }), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    });

    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof UnauthenticatedError) {
      return NextResponse.redirect(new URL("/login", await getAppOrigin()));
    }
    if (err instanceof ForbiddenError) {
      return new NextResponse("Propojení Google kalendáře může zahájit jen obchodník přihlášený pod vlastním účtem.", { status: 403 });
    }
    return new NextResponse("Zahájení propojení selhalo.", { status: 500 });
  }
}
