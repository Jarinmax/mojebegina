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

const fmt = (value: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 }).format(value);

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
