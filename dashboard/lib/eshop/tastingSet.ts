// Ochutnávkový set sirupů 5 × 100 ml (zadání Lucie 17. 11. 2026) — čistá
// pravidla bez DB a bez Reactu.
//
// Set je jeden produkt se dvěma baleními v DB:
//   - SET_CAMPAIGN_SKU: úvodní cena 189 Kč včetně dopravy Zásilkovnou,
//     prvních 100 setů (počítadlo v tastingSetServer.ts),
//   - SET_SKU: běžná cena 249 Kč + doprava.
// Zákazník vidí vždy jen jedno z nich (catalogServer.ts).
//
// Výběr pěti sirupů se nese v řádku košíku jako přípona SKU:
// „SET-SIRUPY-5X100-K~sa.li.za.ib.si“. Košík tak zůstává {sku, množství}
// a dva sety s různým výběrem jsou dva řádky. Do objednávky se ukládá SKU
// bez přípony a výběr je v názvu položky (order_items.name).

/**
 * Set je na webu vidět až po schválení (Lucie řekne „ano“). Do té doby ho
 * vidí jen náhled s cookie SET_PREVIEW_COOKIE (catalogServer.ts).
 */
export const SET_LAUNCHED = false;
export const SET_PREVIEW_COOKIE = "begina_nahled";
export const SET_PREVIEW_VALUE = "set-sirupu-7k3f9q";

export const SET_SLUG = "ochutnavkovy-set-sirupu";
export const SET_SKU = "SET-SIRUPY-5X100";
export const SET_CAMPAIGN_SKU = "SET-SIRUPY-5X100-K";
export const SET_CAMPAIGN_LIMIT = 100;
export const SET_CAMPAIGN_PRICE_KC = 189;
export const SET_SIZE = 5;
const SEPARATOR = "~";

export const SET_SYRUPS = [
  { code: "sa", slug: "bylinny-sirup-saman", name: "Bylinný sirup Šaman", short: "Šaman" },
  { code: "li", slug: "lipovy-sirup", name: "Lipový sirup", short: "Lipový" },
  { code: "za", slug: "zazvorovy-sirup", name: "Zázvorový sirup", short: "Zázvorový" },
  { code: "ib", slug: "ibiskovy-sirup", name: "Ibiškový sirup", short: "Ibiškový" },
  { code: "si", slug: "sipkovy-sirup", name: "Šípkový sirup", short: "Šípkový" },
  { code: "he", slug: "hermankovy-sirup", name: "Heřmánkový sirup", short: "Heřmánkový" },
  { code: "me", slug: "medunkovy-sirup-s-levanduli", name: "Meduňkový sirup s levandulí", short: "Meduňkový s levandulí" },
] as const;

export type SetSyrupCode = (typeof SET_SYRUPS)[number]["code"];
export const SET_DEFAULT_CHOICE: readonly SetSyrupCode[] = ["sa", "li", "za", "ib", "si"];

const BY_CODE = new Map<string, (typeof SET_SYRUPS)[number]>(SET_SYRUPS.map((syrup) => [syrup.code, syrup]));

export function isSetSku(sku: string): boolean {
  const base = baseSku(sku);
  return base === SET_SKU || base === SET_CAMPAIGN_SKU;
}
export function isTastingSet(product: { slug: string }): boolean {
  return product.slug === SET_SLUG;
}
export function isCampaignSetSku(sku: string): boolean {
  return baseSku(sku) === SET_CAMPAIGN_SKU;
}

/** SKU bez přípony s výběrem (to, co je v DB a v objednávce). */
export function baseSku(sku: string): string {
  const at = sku.indexOf(SEPARATOR);
  return at === -1 ? sku : sku.slice(0, at);
}

/** Platný výběr = přesně pět kódů sirupů (stejný smí být víckrát). */
export function validChoice(codes: readonly string[]): codes is SetSyrupCode[] {
  return codes.length === SET_SIZE && codes.every((code) => BY_CODE.has(code));
}

/** SKU řádku košíku pro set s daným výběrem; null = výběr není úplný. */
export function setCartSku(variantSku: string, codes: readonly string[]): string | null {
  return validChoice(codes) ? `${variantSku}${SEPARATOR}${codes.join(".")}` : null;
}

/** Výběr ze SKU řádku košíku; null = bez výběru nebo neplatný. */
export function choiceFromSku(sku: string): SetSyrupCode[] | null {
  const at = sku.indexOf(SEPARATOR);
  if (at === -1) return null;
  const codes = sku.slice(at + 1).split(".");
  return validChoice(codes) ? codes : null;
}

/** „Šaman, Lipový, Zázvorový, Ibiškový, Šípkový“; stejné sirupy za sebou jako „2× Lipový“. */
export function choiceLabel(codes: readonly SetSyrupCode[]): string {
  const counts = new Map<SetSyrupCode, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts].map(([code, count]) => `${count > 1 ? `${count}× ` : ""}${BY_CODE.get(code)!.short}`).join(", ");
}

/** Název položky do košíku a objednávky: „… (Šaman, Lipový, …)“. */
export function withChoice(name: string, sku: string): string {
  const codes = choiceFromSku(sku);
  return codes ? `${name} (${choiceLabel(codes)})` : name;
}

/** Kolik setů za úvodní cenu ještě zbývá (nikdy méně než 0). */
export function campaignRemaining(sold: number): number {
  return Math.max(0, SET_CAMPAIGN_LIMIT - Math.max(0, sold));
}

// Texty na stránce setu.
export const SET_CAMPAIGN_PRICE_NOTE = "Úvodní cena 189 Kč vč. dopravy – prvních 100 setů";
export const SET_UNDER_PRICE = "5 sirupů po 100 ml · z každého až 5 nápojů";
export const SET_DELIVERY_NOTE_CAMPAIGN =
  "Doprava Zásilkovnou na výdejní místo je v ceně. Když set přidáte k chlazenému zboží, přibalíme ho do stejného balíku a nic navíc neplatíte.";
export const SET_DELIVERY_NOTE =
  "Set posíláme Zásilkovnou na výdejní místo. Když ho přidáte k chlazenému zboží, přibalíme ho do stejného balíku a nic navíc neplatíte.";
export const SET_HOME_BANNER = "Ochutnávkový set sirupů – 5 × 100 ml za 189 Kč vč. dopravy";
export const SET_LINK_QUESTION = "Nevíte, který?";
export const SET_LINK_LABEL = "Ochutnávkový set 5 × 100 ml";
export const SET_ONLY_NOT_COLD =
  "Samotný ochutnávkový set posíláme Zásilkovnou na výdejní místo, nebo si ho můžete vyzvednout osobně. Chlazenou přepravou ho přibalíme k dalšímu zboží.";
export const SET_NEEDS_CHOICE = "U ochutnávkového setu vyberte prosím všech pět sirupů.";
export function remainingLabel(remaining: number): string {
  return `Zbývá ${remaining} ze ${SET_CAMPAIGN_LIMIT} setů`;
}
