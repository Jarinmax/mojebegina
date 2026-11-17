// Fakta u produktu pro rychlé rozhodnutí (zadání Lucie 16. 11. 2026):
// trvanlivost po otevření, cena za porci a měrná cena, zvýraznění alergenů
// ve složení a „bez konzervantů“. Všechno se ODVOZUJE z údajů, které už na
// stránce produktu jsou (text trvanlivosti, cena, objem, počet porcí, složení,
// alergeny) — nic se nevymýšlí; kde údaj chybí, řádek se nezobrazí.
import { ALLERGEN_LABELS, type AllergenCode } from "./allergens";
import type { Product, Variant } from "./types";

// ── Trvanlivost po otevření ────────────────────────────────────────────────

export type AfterOpening = { amount: number; unit: "days" | "months" };

/** Z textu trvanlivosti („Po otevření spotřebujte do 14 dnů…“); jinak null. */
export function afterOpening(shelfLife: string | null | undefined): AfterOpening | null {
  const match = /po otevření spotřebujte do (\d+)\s*(dn[ůí]|dne|měsíc[ůe]?)/i.exec(shelfLife ?? "");
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return { amount, unit: match[2].toLowerCase().startsWith("d") ? "days" : "months" };
}

/** „14 dní“, „3 měsíce“, „1 den“. */
export function durationText({ amount, unit }: AfterOpening): string {
  const word =
    unit === "days"
      ? amount === 1 ? "den" : amount <= 4 ? "dny" : "dní"
      : amount === 1 ? "měsíc" : amount <= 4 ? "měsíce" : "měsíců";
  return `${amount} ${word}`;
}

/** Štítek na kartičku: „14 dní po otevření“. */
export function afterOpeningBadge(product: Product): string | null {
  const value = afterOpening(product.foodInfo.shelfLife);
  return value ? `${durationText(value)} po otevření` : null;
}

/** Kategorie, kde se obsah natáčí postupně z jedné beginy (dovětek „natáčíte postupně“). */
const POUR_GRADUALLY = new Set(["polevky", "caje"]);

/** Řádek u tlačítka Do košíku; „v lednici“ jen když to říká text skladování. */
export function afterOpeningLine(product: Product): string | null {
  const value = afterOpening(product.foodInfo.shelfLife);
  if (!value) return null;
  const fridge = /chladni[čc]/i.test(product.foodInfo.storage ?? "") ? " v lednici" : "";
  const tail = POUR_GRADUALLY.has(product.category) ? " – natáčíte postupně" : "";
  return `Po otevření vydrží${fridge} ${durationText(value)}${tail}.`;
}

// ── Cena za porci a měrná cena ─────────────────────────────────────────────

/** Na desetihaléře, vždy dvě desetinná místa: 31,58 → „31,60 Kč“. */
export function formatServingKc(kc: number): string {
  const rounded = Math.round(kc * 10) / 10;
  return `${rounded.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`;
}

/** Měrná cena za litr na celé koruny: „126 Kč/l“. */
export function formatPerLitre(priceKc: number, volumeMl: number): string {
  return `${Math.round((priceKc * 1000) / volumeMl).toLocaleString("cs-CZ")} Kč/l`;
}

export type ServingPrice = { sku: string; label: string | null; text: string };

function servingText(category: string, variant: Variant, fallbackServingMl: number | null): string | null {
  const { priceKc, volumeMl, servings } = variant;
  if (!volumeMl || volumeMl <= 0) return null;
  const perLitre = formatPerLitre(priceKc, volumeMl);
  if (!servings || servings <= 0) {
    // Balení bez počtu porcí: stejná sklenice jako u většího balení (rozhodnutí
    // Lucie 17. 11. 2026 pro půllitrové koktejly – sklenice 200 ml jako u 3 l).
    if (!fallbackServingMl) return perLitre;
    const perGlass = formatServingKc((priceKc * fallbackServingMl) / volumeMl);
    return `Sklenice ${fallbackServingMl} ml za ${perGlass} · ${perLitre}`;
  }
  const perServing = formatServingKc(priceKc / servings);
  // Sirup se ředí na studený i horký nápoj (ne jen limonádu – Lucie 17. 11. 2026);
  // měrná cena za litr sirupu by mátla.
  if (category === "sirupy") return `Nápoj za ${perServing}`;
  const servingMl = Math.round(volumeMl / servings);
  const noun = category === "polevky" ? "Porce" : "Sklenice";
  return `${noun} ${servingMl} ml za ${perServing} · ${perLitre}`;
}

/** Velikost sklenice podle balení, které počet porcí má – jen u koktejlů. */
function siblingServingMl(product: Product): number | null {
  if (product.category !== "koktejly") return null;
  const sizes = new Set(
    product.variants.flatMap((v) => (v.volumeMl && v.servings && v.servings > 0 ? [Math.round(v.volumeMl / v.servings)] : [])),
  );
  return sizes.size === 1 ? [...sizes][0] : null;
}

/** Jeden řádek na každé balení; u produktu s jedním balením bez popisku. */
export function servingPrices(product: Product): ServingPrice[] {
  const single = product.variants.length === 1;
  const fallback = siblingServingMl(product);
  return product.variants.flatMap((variant) => {
    const text = servingText(product.category, variant, fallback);
    return text ? [{ sku: variant.sku, label: single ? null : variant.label, text }] : [];
  });
}

/**
 * Krátký popis bez ceny za porci – ta je jen na jednom místě, v řádku pod
 * cenou (rozhodnutí Lucie 17. 11. 2026). Zbytek popisu se nemění.
 * „Až 12 porcí polévky (31,60 Kč za porci). …“ → „Až 12 porcí polévky. …“
 */
export function withoutServingPrice<T extends string | null>(text: T): T {
  if (text === null) return text;
  return (text as string).replace(/\s*\((?:cca\s*)?\d[\d\s,]*Kč za (?:porci|nápoj|sklenici)\)/giu, "") as T;
}

/**
 * Poznámka u balení bez odhadu „2–3 nápoje“ – počet sklenic říká řádek pod
 * cenou (sklenice 200 ml), rozhodnutí Lucie 17. 11. 2026.
 */
export function withoutGlassRange<T extends string | null>(note: T): T {
  if (note === null) return note;
  return (/^\s*\d+\s*[–-]\s*\d+\s+(?:nápoje|nápojů|sklenice|sklenic)\s*$/iu.test(note) ? null : note) as T;
}

// ── Alergeny ve složení ────────────────────────────────────────────────────

const L = "[\\p{L}]*";
/** Slova, kterými se alergen ve složení píše (kmeny + libovolná koncovka). */
const ALLERGEN_WORDS: Record<AllergenCode, string> = {
  gluten: `(?:lep(?:ek|ku|kem)|pšeni${L}|žit(?:o|a|ná|ný|né|nou)${L}|ječ(?:men|n)${L}|ov(?:es|sa|sn)${L}|špald${L}|kamut${L})`,
  crustaceans: `(?:korýš${L}|krevet${L}|krab${L}|humr${L})`,
  eggs: `(?:vejce|vajec|vaječ${L}|vejc${L})`,
  fish: `(?:ryb(?:a|y|í|ího|ou)${L})`,
  peanuts: `(?:arašíd${L}|podzemnic${L})`,
  soy: `(?:sój${L}|sojov${L})`,
  // kokosové mléko není alergen (mléko = živočišné); kyselina mléčná také ne
  milk: `(?:(?<!kokosov${L}\\s)(?:mlék${L}|(?<!kyselin${L}\\s)mléčn(?!${L}\\s+kyselin)${L}|smetan${L}|másl${L}|sýr${L}|syrovát${L}|laktóz${L}|jogurt${L}))`,
  nuts: `(?:mandl${L}|lískov${L}|vlašsk${L}|kešu|pekanov${L}|para\\s+oře${L}|pistáci${L}|makadam${L}|ořech${L})`,
  celery: `(?:celer${L})`,
  mustard: `(?:hořčic${L}|hořčičn${L})`,
  sesame: `(?:sezam${L})`,
  sulphites: `(?:oxid\\s+siřičit${L}|siřičitan${L}|E\\s?22\\d)`,
  lupin: `(?:vlčí\\s+bob${L}|lupin${L})`,
  molluscs: `(?:měkkýš${L}|mušl${L}|slávk${L}|chobotnic${L}|kalmar${L})`,
};

const CODE_BY_LABEL = new Map(Object.entries(ALLERGEN_LABELS).map(([code, label]) => [label, code as AllergenCode]));

function allergenRegex(codes: AllergenCode[]): RegExp | null {
  if (codes.length === 0) return null;
  return new RegExp(`(?<![\\p{L}])(?:${codes.map((code) => ALLERGEN_WORDS[code]).join("|")})`, "giu");
}

export type TextSegment = { text: string; bold: boolean };

/**
 * Složení rozdělené na úseky; tučně jsou slova alergenů, které produkt má
 * uvedené v řádku Alergeny (české názvy z ALLERGEN_LABELS). Bez alergenů
 * nebo bez shody vrátí celý text jako jeden netučný úsek.
 */
export function highlightAllergens(ingredients: string, allergenLabels: readonly string[] | null | undefined): TextSegment[] {
  const codes = (allergenLabels ?? []).flatMap((label) => {
    const code = CODE_BY_LABEL.get(label);
    return code ? [code] : [];
  });
  const regex = allergenRegex(codes);
  if (!regex) return [{ text: ingredients, bold: false }];
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of ingredients.matchAll(regex)) {
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: ingredients.slice(last, start), bold: false });
    segments.push({ text: match[0], bold: true });
    last = start + match[0].length;
  }
  if (last < ingredients.length) segments.push({ text: ingredients.slice(last), bold: false });
  return segments;
}

/** Kontrola dat: alergeny, jejichž slovo ve složení JE, ale v řádku Alergeny chybí. */
export function undeclaredAllergenWords(ingredients: string, allergenLabels: readonly string[] | null | undefined): string[] {
  const declared = new Set(allergenLabels ?? []);
  return (Object.keys(ALLERGEN_WORDS) as AllergenCode[])
    .filter((code) => !declared.has(ALLERGEN_LABELS[code]))
    .flatMap((code) => [...ingredients.matchAll(allergenRegex([code])!)].map((match) => match[0]));
}

// ── Bez konzervantů ────────────────────────────────────────────────────────

/** Ve složení je konzervant (slovně, siřičitany, nebo E 200–E 299)? */
export function hasPreservative(ingredients: string): boolean {
  return /konzerv|siřičit|sorb(?:an|ov)|benzo(?:an|ov)|dusit|dusičn|\bE\s?2\d\d\b/iu.test(ingredients);
}

export const NO_PRESERVATIVES = "bez konzervantů";

/** Ve složení jsou barviva označená kódem E 100–E 199 (např. v likéru)? */
export function hasColourAdditive(ingredients: string): boolean {
  return /\bE\s?1\d\d\b/u.test(ingredients);
}

/**
 * „Bez konzervantů“ jen když je složení známé a žádný konzervant v něm není.
 * U produktu s přidanými barvivy (E 1xx) se štítek neukazuje vůbec – vedle
 * „éček“ ve složení by působil zavádějícím dojmem.
 */
export function showsNoPreservatives(product: Product): boolean {
  const ingredients = product.foodInfo.ingredients;
  return ingredients !== null && !hasPreservative(ingredients) && !hasColourAdditive(ingredients);
}
