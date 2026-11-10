// Výživové hodnoty v DB (products.nutrition jsonb) → text pro detail
// produktu. Neplatný nebo neúplný záznam = null ("Doplníme"), nikdy
// polovičatý údaj.

type Nutrition = {
  energy_kj: number;
  energy_kcal: number;
  fat: number;
  saturates: number;
  carbohydrate: number;
  sugars: number;
  protein: number;
  salt: number;
};

const KEYS: (keyof Nutrition)[] = [
  "energy_kj",
  "energy_kcal",
  "fat",
  "saturates",
  "carbohydrate",
  "sugars",
  "protein",
  "salt",
];

// Přesnost podle uložené hodnoty (max. 2 desetinná místa — sůl pod 1 g se
// podle pokynů Komise k zaokrouhlování uvádí na 0,01 g, např. 0,76 g).
const fmt = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 }).format(value);
// gramy v tabulce: aspoň jedno desetinné místo („1,0 g“), sůl jak je uložená;
// nula zůstává „0 g“ (stejně jako v dosavadním textu)
const fmtG = (value: number) =>
  value === 0 ? "0" : new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value);

export type NutritionTable = { basis: string; rows: { label: string; value: string; sub?: boolean }[] };

/**
 * Výživové údaje jako tabulka (od 10. 11. 2026 u všech produktů s úplnými
 * údaji). Hodnoty přesně podle uložených dat — nic se nedopočítává; neúplné
 * údaje → null (produkt zůstane u textu / „Doplníme“).
 * Tabulka podle přílohy XV nař. 1169/2011 (pořadí a názvy); vláknina jen je-li uvedena. */
export function nutritionTable(raw: unknown, basis: string | null): NutritionTable | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const n = raw as Record<string, unknown>;
  if (!KEYS.every((key) => typeof n[key] === "number" && Number.isFinite(n[key]))) {
    return null;
  }
  const v = n as unknown as Nutrition;
  const g = (x: number) => `${fmtG(x)}\u00a0g`;
  return {
    basis: basis === "100ml" ? "100 ml" : "100 g",
    rows: [
      { label: "Energetická hodnota", value: `${fmt(v.energy_kj)}\u00a0kJ / ${fmt(v.energy_kcal)}\u00a0kcal` },
      { label: "Tuky", value: g(v.fat) },
      { label: "z toho nasycené mastné kyseliny", value: g(v.saturates), sub: true },
      { label: "Sacharidy", value: g(v.carbohydrate) },
      { label: "z toho cukry", value: g(v.sugars), sub: true },
      ...(typeof n.fibre === "number" && Number.isFinite(n.fibre) ? [{ label: "Vláknina", value: g(n.fibre) }] : []),
      { label: "Bílkoviny", value: g(v.protein) },
      { label: "Sůl", value: g(v.salt) },
    ],
  };
}

export function formatNutrition(raw: unknown, basis: string | null): string | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const n = raw as Record<string, unknown>;
  if (!KEYS.every((key) => typeof n[key] === "number" && Number.isFinite(n[key]))) {
    return null;
  }
  const v = n as unknown as Nutrition;
  const per = basis === "100ml" ? "na 100 ml" : "na 100 g";
  return (
    `${per}: energie ${fmt(v.energy_kj)} kJ / ${fmt(v.energy_kcal)} kcal, tuky ${fmt(v.fat)} g ` +
    `(z toho nasycené ${fmt(v.saturates)} g), sacharidy ${fmt(v.carbohydrate)} g ` +
    `(z toho cukry ${fmt(v.sugars)} g), bílkoviny ${fmt(v.protein)} g, sůl ${fmt(v.salt)} g` +
    // vláknina je nepovinná (uvádějí ji polévky)
    (typeof n.fibre === "number" && Number.isFinite(n.fibre) ? `, vláknina ${fmt(n.fibre)} g` : "")
  );
}
