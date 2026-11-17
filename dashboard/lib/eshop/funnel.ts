// MĚŘENÍ E-SHOPU 1.0 — čisté funkce: kroky nákupu a výpočet trychtýře.

export const FUNNEL_STEPS = ["visit", "product", "add_to_cart", "cart", "checkout"] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const FUNNEL_LABELS: Record<FunnelStep | "order" | "paid", string> = {
  visit: "Návštěvy",
  product: "Zobrazení produktu",
  add_to_cart: "Vložení do košíku",
  cart: "Zobrazení košíku",
  checkout: "Pokladna",
  order: "Odeslané objednávky",
  paid: "Zaplacené objednávky",
};

export function isFunnelStep(value: unknown): value is FunnelStep {
  return typeof value === "string" && (FUNNEL_STEPS as readonly string[]).includes(value);
}

// Návštěvy a objednávky z bezplatných výpisů Google (Merchant Center).
// Google při zapnutém automatickém označování přidá k prokliku do adresy
// parametr „srsltid“. Poznáme ho jen v adresě první stránky; do zařízení
// se nic neukládá (žádné cookies ani úložiště) — jen anonymní součet za den.
export const GOOGLE_STEPS = ["google_visit", "google_order"] as const;
export type GoogleStep = (typeof GOOGLE_STEPS)[number];
export type TrackedStep = FunnelStep | GoogleStep;

export const GOOGLE_LABELS: Record<GoogleStep, string> = {
  google_visit: "Návštěvy z Google výpisů",
  google_order: "Objednávky z Google výpisů",
};

export function isTrackedStep(value: unknown): value is TrackedStep {
  return isFunnelStep(value) || (typeof value === "string" && (GOOGLE_STEPS as readonly string[]).includes(value));
}

/** Proklik z bezplatného výpisu Google (parametr srsltid v adrese). */
export function isGoogleListingLanding(search: string | null | undefined): boolean {
  return /[?&]srsltid=[^&]+/.test(search ?? "");
}

/** Krok podle adresy stránky (na begina.cz bez /eshop, v náhledu s ním). */
export function stepForPath(pathname: string): FunnelStep | null {
  const path = pathname.replace(/^\/eshop(?=\/|$)/, "") || "/";
  if (/^\/produkt\//.test(path)) return "product";
  if (/^\/kosik(\/|$)/.test(path)) return "cart";
  if (/^\/pokladna(\/|$)/.test(path)) return "checkout";
  return null;
}

/** Roboti a náhledy odkazů se nepočítají. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|monitor|facebookexternalhit|whatsapp|curl|wget|python|node-fetch|axios/i.test(userAgent);
}

export type FunnelRow = { key: FunnelStep | "order" | "paid"; label: string; count: number; ofVisitsPct: number | null; ofPreviousPct: number | null };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Trychtýř: podíl z návštěv a z předchozího kroku (null = není z čeho počítat). */
export function buildFunnel(counts: Partial<Record<FunnelStep | "order" | "paid", number>>): FunnelRow[] {
  const keys = [...FUNNEL_STEPS, "order", "paid"] as const;
  const visits = counts.visit ?? 0;
  return keys.map((key, index) => {
    const count = counts[key] ?? 0;
    const previous = index > 0 ? (counts[keys[index - 1]] ?? 0) : 0;
    return { key, label: FUNNEL_LABELS[key], count, ofVisitsPct: index === 0 ? null : pct(count, visits), ofPreviousPct: index === 0 ? null : pct(count, previous) };
  });
}
