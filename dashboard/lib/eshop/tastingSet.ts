// Ochutnávkový set sirupů 5 × 100 ml (zadání Lucie 17. 11. 2026) — čistá
// pravidla bez DB a bez Reactu.
//
// Set je jeden produkt se dvěma baleními v DB:
//   - SET_CAMPAIGN_SKU: akční cena 189 Kč včetně dopravy Zásilkovnou (od SET_CAMPAIGN_FROM),
//     prvních 100 setů (počítadlo v tastingSetServer.ts),
//   - SET_SKU: běžná cena 349 Kč + doprava.
// Zákazník vidí vždy jen jedno z nich (catalogServer.ts).
//
// Výběr pěti sirupů se nese v řádku košíku jako přípona SKU:
// „set-sirupy-5x100-k~sa.li.za.ib.si“. Košík tak zůstává {sku, množství}
// a dva sety s různým výběrem jsou dva řádky. Do objednávky se ukládá SKU
// bez přípony a výběr je v názvu položky (order_items.name).

/**
 * Set je na webu vidět až po schválení (Lucie řekne „ano“). Do té doby ho
 * vidí jen náhled s cookie SET_PREVIEW_COOKIE (catalogServer.ts).
 */
// Spuštěno 18. 11. 2026 večer (Lucie: „Spusť set.“)
export const SET_LAUNCHED = true;
/**
 * Od kdy platí akční cena (Lucie 17. 11. 2026 „ano“): set se nejdřív týden
 * prodává jen za běžnou cenu 349 Kč + doprava, potom se běžná cena
 * přeškrtne a prvních 100 setů je za 189 Kč včetně dopravy.
 * § 12a zák. 634/1992: přeškrtnutá cena = nejnižší cena, za kterou se set
 * od zahájení prodeje nabízel a prodával. null = akce ještě nemá termín.
 * Nastavuje se při spuštění setu na „spuštění + 7 dní“.
 */
// spuštění 18. 11. 2026 + 7 celých dní → akce od 26. 11. 2026 0:00 (Praha)
export const SET_CAMPAIGN_FROM: string | null = "2026-11-26T00:00:00+01:00";
export function campaignRunning(now: Date, from: string | null = SET_CAMPAIGN_FROM): boolean {
  return from !== null && now.getTime() >= new Date(from).getTime();
}
export const SET_PREVIEW_COOKIE = "begina_nahled";
export const SET_PREVIEW_VALUE = "set-sirupu-7k3f9q";

export const SET_SLUG = "ochutnavkovy-set-sirupu";
export const SET_SKU = "set-sirupy-5x100";
export const SET_CAMPAIGN_SKU = "set-sirupy-5x100-k";
export const SET_CAMPAIGN_LIMIT = 100;
export const SET_CAMPAIGN_PRICE_KC = 189;
export const SET_SIZE = 5;
/** Slevový kód pro další nákup po setu (e-mail 5 dní po odeslání, viz setCampaign.ts). */
/** Popisek pod fotkou setu (Lucie 18. 11. 2026) — na fotce není ovoce, jen nápoje. */
export const SET_PHOTO_NOTE = "Sklenice s limonádou a hrnek s čajem na fotce nejsou součástí balení.";

export const SET_COUPON_CODE = "ochutnavka50";
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

/**
 * Platný výběr = přesně pět RŮZNÝCH sirupů (Lucie 17. 11. 2026: stejný
 * víckrát vybrat nejde — i kartička v krabičce má u každého jedno políčko).
 */
export function validChoice(codes: readonly string[]): codes is SetSyrupCode[] {
  return codes.length === SET_SIZE && new Set(codes).size === SET_SIZE && codes.every((code) => BY_CODE.has(code));
}

/** Výběr v pořadí nabídky sirupů (stejný set = stejný řádek košíku bez ohledu na pořadí klikání). */
export function orderedChoice(codes: readonly SetSyrupCode[]): SetSyrupCode[] {
  return SET_SYRUPS.map((syrup) => syrup.code).filter((code) => codes.includes(code));
}

/** SKU řádku košíku pro set s daným výběrem; null = výběr není úplný. */
export function setCartSku(variantSku: string, codes: readonly string[]): string | null {
  return validChoice(codes) ? `${variantSku}${SEPARATOR}${orderedChoice(codes).join(".")}` : null;
}

/** Výběr ze SKU řádku košíku; null = bez výběru nebo neplatný. */
export function choiceFromSku(sku: string): SetSyrupCode[] | null {
  const at = sku.indexOf(SEPARATOR);
  if (at === -1) return null;
  const codes = sku.slice(at + 1).split(".");
  return validChoice(codes) ? codes : null;
}

/** „Šaman, Lipový, Zázvorový, Ibiškový, Šípkový“ */
export function choiceLabel(codes: readonly SetSyrupCode[]): string {
  return codes.map((code) => BY_CODE.get(code)!.short).join(", ");
}

/**
 * Řádek pod názvem setu v košíku a pokladně (Lucie 23. 11. 2026):
 * „Vaše příchutě: Šaman, lipový, zázvorový, ibiškový a šípkový.“
 * null = řádek není set s výběrem.
 */
export function choiceLine(sku: string): string | null {
  const codes = choiceFromSku(sku);
  if (!codes) return null;
  const words = codes.map((code) => {
    const short = BY_CODE.get(code)!.short;
    return code === "sa" ? short : short.charAt(0).toLocaleLowerCase("cs") + short.slice(1);
  });
  return `Vaše příchutě: ${words.slice(0, -1).join(", ")} a ${words[words.length - 1]}.`;
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
export const SET_CAMPAIGN_PRICE_NOTE = "Akční cena včetně dopravy – prvních 100 setů";
export const SET_UNDER_PRICE = "5 příchutí po 100 ml · dohromady 5 litrů limonády nebo čaje";
export const SET_DELIVERY_NOTE_CAMPAIGN =
  "Doprava Zásilkovnou na výdejní místo je v ceně. Když set přidáte k chlazenému zboží, přibalíme ho do stejného balíku a nic navíc neplatíte.";
export const SET_DELIVERY_NOTE =
  "Set posíláme Zásilkovnou na výdejní místo. Když ho přidáte k chlazenému zboží, přibalíme ho do stejného balíku a nic navíc neplatíte.";
export const SET_HOME_BANNER = "Ochutnávkový set sirupů – 5 × 100 ml za 189 Kč vč. dopravy";
export const SET_SYRUPS_HEADING = "Složení sirupů, ze kterých vybíráte";
export const SET_PICK_FAVOURITES = "Vybrat 5 nejoblíbenějších";
export const SET_LINK_QUESTION = "Nevíte, který?";
export const SET_LINK_LABEL = "Ochutnávkový set 5 × 100 ml";
export const SET_ONLY_NOT_COLD =
  "Samotný ochutnávkový set posíláme Zásilkovnou na výdejní místo, nebo si ho můžete vyzvednout osobně. Chlazenou přepravou ho přibalíme k dalšímu zboží.";
export const SET_NEEDS_CHOICE = "U ochutnávkového setu vyberte prosím pět různých sirupů.";
/** Povinná informace u slevy (§ 12a zák. 634/1992). */
export function lowestPriceNote(priceKc: number): string {
  return `Nejnižší cena před slevou: ${priceKc} Kč + doprava`;
}
export function remainingLabel(remaining: number): string {
  return `Zbývá ${remaining} ze ${SET_CAMPAIGN_LIMIT} setů`;
}
