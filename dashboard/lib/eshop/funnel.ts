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

// ZDROJE NÁVŠTĚV (21. 11. 2026) — odkud návštěva přišla. Pozná se jen
// z adresy první stránky (utm_source, srsltid, fbclid) a z adresy stránky,
// ze které člověk klikl (referrer). Nic se neukládá do zařízení.
export const SOURCES = ["google", "google_vypis", "seznam", "bing", "chatgpt", "perplexity", "copilot", "gemini", "claude", "meta", "email", "jiny_web", "primo"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<Source, string> = {
  google: "Google (vyhledávání)",
  google_vypis: "Google (výpisy zboží)",
  seznam: "Seznam",
  bing: "Bing",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  copilot: "Copilot",
  gemini: "Gemini",
  claude: "Claude",
  meta: "Facebook / Instagram",
  email: "E-mail",
  jiny_web: "Jiný web",
  primo: "Přímo (napsaná adresa, záložka, aplikace)",
};
export const AI_SOURCES: readonly Source[] = ["chatgpt", "perplexity", "copilot", "gemini", "claude"];
export const sourceVisitStep = (source: Source) => `src_visit_${source}` as const;
export const sourceOrderStep = (source: Source) => `src_order_${source}` as const;
/** Pokladna se zaškrtnutým „Nakupuji na firmu“ (kavárny a bistra). */
export const COMPANY_CHECKOUT_STEP = "firma_checkout";

const SOURCE_STEPS = new Set<string>([...SOURCES.map(sourceVisitStep), ...SOURCES.map(sourceOrderStep), COMPANY_CHECKOUT_STEP]);

function hostOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : "";
  } catch {
    return "";
  }
}

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/**
 * Zdroj návštěvy. null = člověk přišel z našeho vlastního webu (obnovení,
 * nová záložka, přechod z moje.begina.cz) — to není nová návštěva zvenku.
 */
export function classifySource(referrer: string | null | undefined, search: string | null | undefined): Source | null {
  const params = new URLSearchParams(search ?? "");
  const utm = (params.get("utm_source") ?? "").toLowerCase();
  const host = hostOf(referrer);
  if (isGoogleListingLanding(search)) return "google_vypis";
  if (utm.includes("chatgpt") || utm.includes("openai") || hostIs(host, "chatgpt.com") || hostIs(host, "openai.com")) return "chatgpt";
  if (utm.includes("perplexity") || hostIs(host, "perplexity.ai")) return "perplexity";
  if (utm.includes("copilot") || hostIs(host, "copilot.microsoft.com") || hostIs(host, "copilot.cloud.microsoft")) return "copilot";
  if (utm.includes("gemini") || hostIs(host, "gemini.google.com") || hostIs(host, "bard.google.com")) return "gemini";
  if (utm.includes("claude") || hostIs(host, "claude.ai")) return "claude";
  if (params.has("fbclid") || utm.includes("facebook") || utm.includes("instagram") || utm === "fb" || utm === "ig" || /(^|\.)(facebook|fb|instagram)\.com$/.test(host) || host === "l.facebook.com") return "meta";
  if (utm.includes("mail") || utm.includes("newsletter") || /(^|\.)(mail\.google\.com|email\.seznam\.cz|outlook\.live\.com)$/.test(host)) return "email";
  if (host && hostIs(host, "begina.cz")) return null;
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
  if (hostIs(host, "seznam.cz")) return "seznam";
  if (hostIs(host, "bing.com")) return "bing";
  if (host) return "jiny_web";
  return "primo";
}

export function isTrackedStep(value: unknown): value is TrackedStep | string {
  return isFunnelStep(value) || (typeof value === "string" && ((GOOGLE_STEPS as readonly string[]).includes(value) || SOURCE_STEPS.has(value)));
}

/** Cookie, kterým se vlastní zařízení (Lucie, Jarin) vyřadí z měření. */
export const OPT_OUT_COOKIE = "begina_nemerit";
export function hasOptOutCookie(cookieHeader: string | null | undefined): boolean {
  return new RegExp(`(^|;\\s*)${OPT_OUT_COOKIE}=1(;|$)`).test(cookieHeader ?? "");
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

export type SourceRow = { source: Source; label: string; visits: number; orders: number; isAi: boolean };

/** Zdroje seřazené podle návštěv (jen ty, které něco mají). */
export function sourceRows(days: { counts: Record<string, number | undefined> }[]): SourceRow[] {
  return SOURCES.map((source) => ({
    source,
    label: SOURCE_LABELS[source],
    visits: days.reduce((sum, day) => sum + (day.counts[sourceVisitStep(source)] ?? 0), 0),
    orders: days.reduce((sum, day) => sum + (day.counts[sourceOrderStep(source)] ?? 0), 0),
    isAi: AI_SOURCES.includes(source),
  }))
    .filter((row) => row.visits > 0 || row.orders > 0)
    .sort((a, b) => b.visits - a.visits || b.orders - a.orders);
}

export type SegmentSplit = { companyCheckout: number; ordersCompany: number; ordersHome: number; paidCompany: number; paidHome: number };

/** Kavárny (IČO) proti domácnostem. */
export function segmentSplit(days: { counts: Record<string, number | undefined> }[]): SegmentSplit {
  const sum = (key: string) => days.reduce((total, day) => total + (day.counts[key] ?? 0), 0);
  return {
    companyCheckout: sum(COMPANY_CHECKOUT_STEP),
    ordersCompany: sum("order_ico"),
    ordersHome: sum("order") - sum("order_ico"),
    paidCompany: sum("paid_ico"),
    paidHome: sum("paid") - sum("paid_ico"),
  };
}
