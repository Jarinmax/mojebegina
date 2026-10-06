// Finance 1.0 — návrat z přihlášení k iDokladu (Redirect URI). První test:
// vymění kód za access token, jen ČTE agendu a počty dokladů a token
// zahodí. Nic se neukládá do DB, nic se v iDokladu nemění, žádná faktura.
//
// Pořadí kontrol: konfigurace (Production → 404) → cookie se `state` se
// hned smaže (jednorázová) → přihlášený Viner → chyba od iDokladu →
// ověření `state` (podpis, platnost, stejný uživatel, shoda s cookie) →
// teprve pak výměna kódu. Výsledek jde do krátkodobé podepsané cookie
// pro stránku testu.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/data/authContext";
import { isFinanceManager } from "@/lib/data/financeAuth";
import { IdokladClient } from "@/lib/finance/idoklad/client";
import { IdokladError } from "@/lib/finance/idoklad/errors";
import { exchangeAuthorizationCode, signPayload, verifyOAuthState } from "@/lib/finance/idoklad/oauth";
import { resolveIdokladOAuthConfig } from "@/lib/finance/oauthConfig";
import {
  IDOKLAD_COOKIE_MAX_AGE_SECONDS,
  IDOKLAD_RESULT_COOKIE,
  IDOKLAD_SEQUENCES_COOKIE,
  IDOKLAD_CODEBOOKS_COOKIE,
  IDOKLAD_STATE_COOKIE,
  IDOKLAD_STATE_COOKIE_PATH,
  IDOKLAD_TEST_PAGE_PATH,
} from "@/lib/finance/oauthCookies";
import {
  runReadOnlyAccountCheck,
  splitResultForCookies,
  type ReadOnlyCheckFailure,
  type ReadOnlyCheckResult,
} from "@/lib/finance/readOnlyCheck";

export const dynamic = "force-dynamic";

// Limit požadavků pro jeden test: agenda + počty kolekcí + číselné řady, s rezervou.
const CHECK_REQUEST_BUDGET = 30;

function oauthErrorMessage(error: string): string {
  if (error === "access_denied") return "Přihlášení k iDokladu bylo zrušeno nebo zamítnuto.";
  const code = error.replace(/[^a-z_]/gi, "").slice(0, 40);
  return `iDoklad vrátil chybu přihlášení (${code || "neznámá"}).`;
}

export async function GET(request: Request) {
  const config = resolveIdokladOAuthConfig(process.env);
  if (!config.ok) {
    if (config.production) {
      return new NextResponse("Not found", { status: 404 });
    }
    return NextResponse.redirect(new URL(IDOKLAD_TEST_PAGE_PATH, request.url));
  }

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(IDOKLAD_STATE_COOKIE)?.value ?? null;
  cookieStore.set(IDOKLAD_STATE_COOKIE, "", { path: IDOKLAD_STATE_COOKIE_PATH, maxAge: 0 });

  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", config.redirectOrigin));
  }
  if (!isFinanceManager(ctx)) {
    return new NextResponse("Připojení iDokladu smí dokončit jen Jaroslav Viner.", { status: 403 });
  }

  const finish = (result: ReadOnlyCheckResult | ReadOnlyCheckFailure) => {
    const options = {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: IDOKLAD_TEST_PAGE_PATH,
      maxAge: IDOKLAD_COOKIE_MAX_AGE_SECONDS,
    };
    if (result.ok) {
      const { main, sequences, codebooks } = splitResultForCookies(result);
      cookieStore.set(IDOKLAD_RESULT_COOKIE, signPayload({ v: 1, u: ctx.userId, r: main }, config.stateSecret), options);
      cookieStore.set(IDOKLAD_SEQUENCES_COOKIE, signPayload({ v: 1, u: ctx.userId, ...sequences }, config.stateSecret), options);
      cookieStore.set(IDOKLAD_CODEBOOKS_COOKIE, signPayload({ v: 1, u: ctx.userId, ...codebooks }, config.stateSecret), options);
    } else {
      cookieStore.set(IDOKLAD_RESULT_COOKIE, signPayload({ v: 1, u: ctx.userId, r: result }, config.stateSecret), options);
      cookieStore.set(IDOKLAD_SEQUENCES_COOKIE, "", { ...options, maxAge: 0 });
      cookieStore.set(IDOKLAD_CODEBOOKS_COOKIE, "", { ...options, maxAge: 0 });
    }
    return NextResponse.redirect(new URL(IDOKLAD_TEST_PAGE_PATH, config.redirectOrigin));
  };
  const failure = (code: string, message: string) =>
    finish({ ok: false, checkedAt: new Date().toISOString(), code, message });

  const params = new URL(request.url).searchParams;
  const oauthError = params.get("error");
  if (oauthError) {
    return failure("oauth_error", oauthErrorMessage(oauthError));
  }

  const stateCheck = verifyOAuthState({
    cookieState,
    returnedState: params.get("state"),
    userId: ctx.userId,
    secret: config.stateSecret,
    now: Date.now(),
  });
  if (!stateCheck.ok) {
    return failure("state_invalid", stateCheck.reason);
  }

  const code = params.get("code");
  if (!code) {
    return failure("code_missing", "iDoklad nevrátil autorizační kód.");
  }

  try {
    const token = await exchangeAuthorizationCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    // Token žije jen v této proměnné a v klientovi — po návratu z funkce zaniká.
    const client = new IdokladClient({ accessToken: token.accessToken, requestBudget: CHECK_REQUEST_BUDGET });
    const result = await runReadOnlyAccountCheck({
      client,
      companyIco: config.companyIco,
      vatModeConfigured: config.vatMode,
      now: new Date(),
      refreshTokenReturned: token.refreshTokenReturned,
    });
    return finish(result);
  } catch (error) {
    if (error instanceof IdokladError) {
      return failure(error.code, error.userMessage);
    }
    return failure("internal", "Ověření připojení skončilo neočekávanou chybou.");
  }
}
