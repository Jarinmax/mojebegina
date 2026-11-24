// MĚŘENÍ E-SHOPU 1.1 — prohlížeč. Každý krok se pošle nejvýš jednou za
// načtení webu; stav je jen v paměti stránky (žádné úložiště). Jediné
// cookie je „begina_nemerit“ na vlastních zařízeních týmu (odkaz ?nemerit=1).
import { recordFunnelStep } from "./funnelActions";
import { COMPANY_CHECKOUT_STEP, OPT_OUT_COOKIE, classifySource, hasOptOutCookie, isGoogleListingLanding, sourceOrderStep, sourceVisitStep, type Source } from "./funnel";

const sent = new Set<string>();
// Přišel návštěvník z Google výpisu? Jen v paměti stránky: platí při
// procházení e-shopu; po obnovení stránky nebo v nové záložce se zapomene.
let fromGoogle = false;
let landingSource: Source | null = null;
let landingNoted = false;

function optedOut(): boolean {
  if (typeof document === "undefined") return true;
  // Automaticky řízený prohlížeč (testy, kontroly webu) se nepočítá.
  if (typeof navigator !== "undefined" && navigator.webdriver) return true;
  const params = new URLSearchParams(window.location.search);
  // Cookie pro celé begina.cz (www i moje), ať platí všude.
  const domain = window.location.hostname.endsWith("begina.cz") ? "; Domain=.begina.cz" : "";
  if (params.get("nemerit") === "1") {
    document.cookie = `${OPT_OUT_COOKIE}=1; Max-Age=${60 * 60 * 24 * 400}; Path=/; SameSite=Lax; Secure${domain}`;
  } else if (params.get("nemerit") === "0") {
    document.cookie = `${OPT_OUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure${domain}`;
    document.cookie = `${OPT_OUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
  }
  return hasOptOutCookie(document.cookie);
}

export function trackFunnel(step: string): void {
  if (typeof window === "undefined" || sent.has(step) || optedOut()) return;
  sent.add(step);
  void recordFunnelStep(step).catch(() => undefined);
}

/** První stránka návštěvy: zdroj (Google výpis, ChatGPT, Facebook…). */
export function noteLanding(referrer: string, search: string): void {
  if (landingNoted) return;
  landingNoted = true;
  if (isGoogleListingLanding(search)) {
    fromGoogle = true;
    trackFunnel("google_visit");
  }
  landingSource = classifySource(referrer, search);
  if (landingSource) trackFunnel(sourceVisitStep(landingSource));
}

/** Zaškrtnuto „Nakupuji na firmu“ v pokladně. */
export function trackCompanyCheckout(): void {
  trackFunnel(COMPANY_CHECKOUT_STEP);
}

/** Odeslaná objednávka — připsat zdroji návštěvy (a Google výpisu). */
export function trackOrderSource(): void {
  if (fromGoogle) trackFunnel("google_order");
  if (landingSource) trackFunnel(sourceOrderStep(landingSource));
}
