// Finance 1.0 — zahájení OAuth přihlášení k iDokladu (první read-only test,
// jen Preview). V Production vrací 404. Smí jen Jaroslav Viner
// (isFinanceManager). `state` se podepíše, naváže na jeho userId a uloží do
// krátkodobé httpOnly cookie; callback ho nezávisle ověří.
//
// Přihlášení musí začít na STEJNÉ adrese, kam iDoklad vrací (Redirect URI) —
// jinak by prohlížeč cookie se `state` při návratu neposlal. Proto se
// požadavek z jiné adresy (např. adresa konkrétního nasazení) nejdřív
// přesměruje na adresu větve.
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getAuthContext } from "@/lib/data/authContext";
import { isFinanceManager } from "@/lib/data/financeAuth";
import { buildAuthorizeUrl, createOAuthState } from "@/lib/finance/idoklad/oauth";
import { resolveIdokladOAuthConfig } from "@/lib/finance/oauthConfig";
import {
  IDOKLAD_COOKIE_MAX_AGE_SECONDS,
  IDOKLAD_STATE_COOKIE,
  IDOKLAD_STATE_COOKIE_PATH,
  IDOKLAD_TEST_PAGE_PATH,
} from "@/lib/finance/oauthCookies";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = resolveIdokladOAuthConfig(process.env);
  if (!config.ok) {
    if (config.production) {
      return new NextResponse("Not found", { status: 404 });
    }
    // Stránka testu (na stejné adrese) ukáže, co chybí — jen názvy proměnných.
    return NextResponse.redirect(new URL(IDOKLAD_TEST_PAGE_PATH, request.url));
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const expectedHost = new URL(config.redirectOrigin).host;
  if (host !== expectedHost) {
    return NextResponse.redirect(new URL("/api/idoklad/connect", config.redirectOrigin));
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", config.redirectOrigin));
  }
  if (!isFinanceManager(ctx)) {
    return new NextResponse("Připojení iDokladu smí zahájit jen Jaroslav Viner.", { status: 403 });
  }

  const state = createOAuthState({ userId: ctx.userId, secret: config.stateSecret, now: Date.now() });
  const cookieStore = await cookies();
  cookieStore.set(IDOKLAD_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: IDOKLAD_STATE_COOKIE_PATH,
    maxAge: IDOKLAD_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(
    buildAuthorizeUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state })
  );
}
