// Finance 1.0 — konfigurace prvního OAuth testu iDokladu (jen Preview).
//
// Pravidla:
//   • V Production je test VYPNUTÝ (route vrací 404) — Production se tímto
//     krokem nemění.
//   • Mimo Production musí být test výslovně zapnutý
//     (IDOKLAD_OAUTH_TEST_ENABLED=on) a musí být nastavené všechny povinné
//     proměnné. Chybějící se hlásí jen NÁZVEM, nikdy hodnotou.
//   • IDOKLAD_REDIRECT_URI musí být přesně https://<host>/api/idoklad/callback.
//     Mimo Production nesmí mířit na moje.begina.cz (autorizační kód by
//     dostala produkční aplikace) a pokud Vercel zná adresu větve
//     (VERCEL_BRANCH_URL), musí mířit právě na ni.
import type { VatMode } from "./types";

export const IDOKLAD_CALLBACK_PATH = "/api/idoklad/callback";
export const IDOKLAD_PRODUCTION_HOST = "moje.begina.cz";

export const IDOKLAD_OAUTH_REQUIRED_ENV = [
  "IDOKLAD_OAUTH_TEST_ENABLED",
  "IDOKLAD_CLIENT_ID",
  "IDOKLAD_CLIENT_SECRET",
  "IDOKLAD_REDIRECT_URI",
  "IDOKLAD_OAUTH_STATE_SECRET",
] as const;

// Čte: IDOKLAD_OAUTH_REQUIRED_ENV + VERCEL_ENV, VERCEL_BRANCH_URL,
// FINANCE_COMPANY_ICO, FINANCE_VAT_MODE. Obecný záznam, aby šlo předat
// přímo process.env.
export type IdokladOAuthEnv = Readonly<Record<string, string | undefined>>;

export type IdokladOAuthConfig =
  | {
      ok: true;
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      redirectOrigin: string;
      stateSecret: string;
      companyIco: string | null;
      vatMode: VatMode | null;
    }
  | { ok: false; production: boolean; reason: string; missing: string[] };

const MIN_STATE_SECRET_LENGTH = 32;

export function resolveIdokladOAuthConfig(env: IdokladOAuthEnv): IdokladOAuthConfig {
  if (env.VERCEL_ENV === "production") {
    return { ok: false, production: true, reason: "V Production je OAuth test iDokladu vypnutý.", missing: [] };
  }
  const fail = (reason: string, missing: string[] = []): IdokladOAuthConfig => ({
    ok: false,
    production: false,
    reason,
    missing,
  });

  const missing = IDOKLAD_OAUTH_REQUIRED_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return fail("Chybí proměnné prostředí pro připojení iDokladu.", [...missing]);
  }
  if (env.IDOKLAD_OAUTH_TEST_ENABLED !== "on") {
    return fail("OAuth test iDokladu není zapnutý (IDOKLAD_OAUTH_TEST_ENABLED musí být „on“).");
  }
  const stateSecret = env.IDOKLAD_OAUTH_STATE_SECRET!.trim();
  if (stateSecret.length < MIN_STATE_SECRET_LENGTH) {
    return fail(`IDOKLAD_OAUTH_STATE_SECRET je příliš krátký (min. ${MIN_STATE_SECRET_LENGTH} znaků).`);
  }

  const redirectUri = env.IDOKLAD_REDIRECT_URI!.trim();
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    return fail("IDOKLAD_REDIRECT_URI není platná adresa.");
  }
  if (
    redirect.protocol !== "https:" ||
    redirect.pathname !== IDOKLAD_CALLBACK_PATH ||
    redirect.search !== "" ||
    redirect.hash !== "" ||
    redirect.username !== "" ||
    redirect.port !== ""
  ) {
    return fail(`IDOKLAD_REDIRECT_URI musí mít tvar https://<adresa>${IDOKLAD_CALLBACK_PATH}.`);
  }
  if (redirect.hostname === IDOKLAD_PRODUCTION_HOST) {
    return fail("Mimo Production nesmí IDOKLAD_REDIRECT_URI mířit na moje.begina.cz — použijte adresu Preview větve.");
  }
  const branchHost = env.VERCEL_BRANCH_URL?.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (branchHost && branchHost !== redirect.host) {
    return fail(`IDOKLAD_REDIRECT_URI míří na ${redirect.host}, ale tato větev běží na ${branchHost}.`);
  }

  const ico = env.FINANCE_COMPANY_ICO?.replace(/\s+/g, "");
  return {
    ok: true,
    clientId: env.IDOKLAD_CLIENT_ID!.trim(),
    clientSecret: env.IDOKLAD_CLIENT_SECRET!.trim(),
    redirectUri: redirect.toString(),
    redirectOrigin: redirect.origin,
    stateSecret,
    companyIco: ico && /^\d{6,10}$/.test(ico) ? ico : null,
    vatMode: env.FINANCE_VAT_MODE === "non_payer" || env.FINANCE_VAT_MODE === "payer" ? env.FINANCE_VAT_MODE : null,
  };
}
