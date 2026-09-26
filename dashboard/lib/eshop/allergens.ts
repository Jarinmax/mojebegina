// Kódy alergenů v DB (products.allergens, CHECK v migraci 0011) → český
// název podle přílohy II nařízení 1169/2011.

import type { ALLERGEN_CODES } from "@/lib/db/schema";

export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const ALLERGEN_LABELS: Record<AllergenCode, string> = {
  gluten: "obiloviny obsahující lepek",
  crustaceans: "korýši",
  eggs: "vejce",
  fish: "ryby",
  peanuts: "podzemnice olejná (arašídy)",
  soy: "sójové boby",
  milk: "mléko",
  nuts: "skořápkové plody",
  celery: "celer",
  mustard: "hořčice",
  sesame: "sezamová semena",
  sulphites: "oxid siřičitý a siřičitany",
  lupin: "vlčí bob (lupina)",
  molluscs: "měkkýši",
};

export function allergenLabel(code: string): string {
  return ALLERGEN_LABELS[code as AllergenCode] ?? code;
}
