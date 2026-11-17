// MĚŘENÍ E-SHOPU 1.0 — prohlížeč. Každý krok se pošle nejvýš jednou za
// načtení webu; stav je jen v paměti stránky (žádné cookies ani úložiště).
import { recordFunnelStep } from "./funnelActions";
import { isGoogleListingLanding, type TrackedStep } from "./funnel";

const sent = new Set<TrackedStep>();
// Přišel návštěvník z Google výpisu? Jen v paměti stránky: platí při
// procházení e-shopu; po obnovení stránky nebo v nové záložce se zapomene.
let fromGoogle = false;

export function trackFunnel(step: TrackedStep): void {
  if (typeof window === "undefined" || sent.has(step)) return;
  sent.add(step);
  void recordFunnelStep(step).catch(() => undefined);
}

/** První stránka návštěvy: proklik z Google výpisu → započítat návštěvu. */
export function noteGoogleLanding(search: string): void {
  if (fromGoogle || !isGoogleListingLanding(search)) return;
  fromGoogle = true;
  trackFunnel("google_visit");
}

/** Odeslaná objednávka — započítat, pokud návštěva začala z Google výpisu. */
export function trackGoogleOrder(): void {
  if (fromGoogle) trackFunnel("google_order");
}
