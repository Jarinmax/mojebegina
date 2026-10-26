// Odkazy uvnitř e-shopu. Na begina.cz žijí stránky v kořeni (/produkt/x),
// na moje.begina.cz (a Preview) pod /eshop (/eshop/produkt/x). Kód
// e-shopu proto NIKDY nepíše „/eshop/…“ natvrdo — vždy eshopHref(base, cesta),
// kde base přichází z proxy.ts (hlídá lib/eshop/__tests__/eshopPaths.test.ts).
//
// Statické soubory (/eshop/kulajda.jpg) se NEmění — jsou na obou doménách
// pod stejnou adresou.
import { PUBLIC_HOST, PUBLIC_ORIGIN, siteForHost } from "@/lib/site/hosts";
import { canonicalRedirectEnabled } from "@/lib/site/flags";

export type EshopBase = "" | "/eshop";

export const INTERNAL_ESHOP_BASE: EshopBase = "/eshop";

export function baseForSite(site: "public" | "internal"): EshopBase {
  return site === "public" ? "" : INTERNAL_ESHOP_BASE;
}

/** Cesta e-shopu („/", „/produkt/kulajda", „/kosik?x=1") → odkaz pro danou doménu. */
export function eshopHref(base: EshopBase, path: string): string {
  if (!path.startsWith("/")) throw new Error(`Cesta e-shopu musí začínat „/“: ${path}`);
  if (path === "/") return base || "/";
  return `${base}${path}`;
}

type Env = Record<string, string | undefined>;

/**
 * Úplná adresa stránky e-shopu do e-mailu nebo pro návrat ze Stripe.
 * appOrigin = adresa aplikace, ze které se odkaz posílá (moje.begina.cz,
 * Preview, begina.cz…).
 *   - ESHOP_CANONICAL_ORIGIN zapnutý (po přepnutí DNS) → https://begina.cz/…
 *   - požadavek přišel přes begina.cz → https://begina.cz/…
 *   - jinak jako dosud → <appOrigin>/eshop/…
 */
export function eshopAbsoluteUrl(appOrigin: string, path: string, env: Env = process.env): string {
  if (canonicalRedirectEnabled(env)) return `${PUBLIC_ORIGIN}${eshopHref("", path)}`;
  const origin = appOrigin.replace(/\/+$/, "");
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    host = "";
  }
  if (siteForHost(host) === "public") return `https://${PUBLIC_HOST}${eshopHref("", path)}`;
  return `${origin}${eshopHref(INTERNAL_ESHOP_BASE, path)}`;
}

/** Stránka objednávky pro zákazníka (náhodné id = jediný „klíč“). */
export function orderStatusPath(orderId: string): string {
  return `/objednavka/${orderId}`;
}
