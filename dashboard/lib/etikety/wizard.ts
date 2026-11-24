// Etikety krok za krokem (17. 11. 2026, přání Lucie): Jazyk → Druh výrobku →
// Množství → Typ etikety. Jen jiný pohled na stejné složky z structure.ts —
// soubory ani složky se nemění.
import { ETIKETY_CATEGORIES, type EtiketyCategory } from "./structure";

export type Lang = "cz" | "sk";
export type WizardOption = { folder: string; size: string | null; kind: string };

const SIZE_LABEL: Record<string, string> = {
  "3l": "3 l",
  "650ml": "650 ml",
  "500ml": "500 ml",
  "450ml": "450 ml",
  "250ml": "250 ml",
  "200ml": "200 ml",
  "100ml": "100 ml",
};

const KIND_LABEL: Record<Lang, Record<string, string>> = {
  cz: {
    slozeni: "Složení (zadní etiketa)",
    "predni-cervenocerne": "Přední – červeno-černá",
    "predni-cernobile": "Přední – černobílá",
    "predni-barevne": "Přední – barevná",
    "ochutnavkovy-set": "Krabice ochutnávkového setu",
  },
  sk: {
    slozeni: "Zloženie (zadná etiketa)",
    "predni-cervenocerne": "Predná – červeno-čierna",
    "predni-cernobile": "Predná – čiernobiela",
    "predni-barevne": "Predná – farebná",
    "ochutnavkovy-set": "Krabica ochutnávkového setu",
  },
};

/** Která role musí být v tiskárně Brother — ukazuje se u typu etikety. */
export const KIND_ROLL: Record<string, string> = {
  slozeni: "Brother role DK-22212 (bílá)",
  "predni-cernobile": "Brother role DK-22212 (bílá)",
  "predni-cervenocerne": "Brother role DK-22251 (červeno-černá)",
  "ochutnavkovy-set": "soubory „černobílé“ na DK-22212, ostatní na DK-22251",
};

const KIND_ORDER = ["slozeni", "predni-cervenocerne", "predni-cernobile", "predni-barevne", "ochutnavkovy-set"];
const SIZE_ORDER = ["3l", "650ml", "500ml", "450ml", "250ml", "200ml", "100ml"];

export function sizeLabel(size: string): string {
  return SIZE_LABEL[size] ?? size;
}
export function kindLabel(lang: Lang, kind: string): string {
  return KIND_LABEL[lang][kind] ?? kind;
}

/** "predni-barevne-650ml" → { kind: "predni-barevne", size: "650ml" }; "3l" → složení 3 l. */
export function parseGroupSlug(slug: string): { kind: string; size: string | null } {
  if (slug === "ochutnavkovy-set") return { kind: slug, size: "100ml" };
  const m = slug.match(/^(?:(.*)-)?(\d+(?:l|ml))$/);
  if (m) return { kind: m[1] ?? "slozeni", size: m[2] };
  // Původní složky bez objemu v názvu (polevky/slozeni, polevky/predni-barevne …) jsou 3 l.
  if (KIND_ORDER.includes(slug)) return { kind: slug, size: "3l" };
  return { kind: slug, size: null };
}

export function categoriesFor(lang: Lang): EtiketyCategory[] {
  return ETIKETY_CATEGORIES.filter((c) => (lang === "sk" ? c.slug.startsWith("sk-") : !c.slug.startsWith("sk-")));
}

/** Název bez "🇸🇰 SK – " a bez "(3 l)" — množství se volí zvlášť. */
export function categoryLabel(c: EtiketyCategory): string {
  return c.label.replace(/^🇸🇰\s*SK\s*–\s*/, "").replace(/\s*\([^)]*\)\s*$/, "");
}
/** Pevné množství z názvu kategorie ("Polévky (3 l)" → "3 l"), jinak null. */
export function categoryFixedSize(c: EtiketyCategory): string | null {
  const m = c.label.match(/\(([^)]*)\)\s*$/);
  return m ? m[1] : null;
}

export function optionsFor(c: EtiketyCategory): WizardOption[] {
  return (c.groups ?? []).map((g) => ({ folder: `${c.slug}/${g.slug}`, ...parseGroupSlug(g.slug) }));
}

export function sizesFor(c: EtiketyCategory): string[] {
  const sizes = [...new Set(optionsFor(c).map((o) => o.size).filter((s): s is string => !!s))];
  return sizes.sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
}

export function kindsFor(c: EtiketyCategory, size: string | null): WizardOption[] {
  return optionsFor(c)
    .filter((o) => o.size === size)
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

// Co opravdu prodáváme (Lucie 23. 11. 2026). Ostatní objemy zůstávají
// připravené, jen schované pod „Další objemy“.
const SOLD_SIZES: Record<string, string[] | "all"> = {
  polevky: ["3l", "450ml", "200ml"],
  sirupy: "all",
  "ovocne-napoje": ["3l"],
  caje: ["3l"],
  "alkoholicke-koktejly": ["3l", "200ml"],
};

export function isSoldSize(c: EtiketyCategory, size: string): boolean {
  const sold = SOLD_SIZES[c.slug.replace(/^sk-/, "")];
  return !sold || sold === "all" || sold.includes(size);
}
