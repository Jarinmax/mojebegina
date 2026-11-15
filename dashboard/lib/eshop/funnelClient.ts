// MĚŘENÍ E-SHOPU 1.0 — prohlížeč. Každý krok se pošle nejvýš jednou za
// načtení webu; stav je jen v paměti stránky (žádné cookies ani úložiště).
import { recordFunnelStep } from "./funnelActions";
import type { FunnelStep } from "./funnel";

const sent = new Set<FunnelStep>();

export function trackFunnel(step: FunnelStep): void {
  if (typeof window === "undefined" || sent.has(step)) return;
  sent.add(step);
  void recordFunnelStep(step).catch(() => undefined);
}
