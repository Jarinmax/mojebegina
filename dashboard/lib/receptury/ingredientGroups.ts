// Skupiny ceníku surovin a obalů (19. 11. 2026, přání Lucie): na mobilu se
// otevře jen jedna skupina, ne celý dlouhý seznam. Jen zobrazení podle názvu —
// databáze ani ceny se nemění. Nová surovina bez shody spadne do „Ostatní suroviny“.
export type IngredientGroup = { key: string; label: string };

export const INGREDIENT_GROUPS: IngredientGroup[] = [
  { key: "obaly", label: "Obaly a etikety" },
  { key: "byliny", label: "Byliny a čaje" },
  { key: "cukr", label: "Cukr, oleje a základ" },
  { key: "zelenina", label: "Zelenina a houby" },
  { key: "stavy", label: "Šťávy" },
  { key: "koreni", label: "Koření" },
  { key: "aroma", label: "Esenciální oleje" },
  { key: "alkohol", label: "Alkohol" },
  { key: "ostatni", label: "Ostatní suroviny" },
  { key: "mimo", label: "Ostatní nákupy (mimo receptury)" },
];

const RULES: [string, RegExp][] = [
  ["aroma", /esenciální olej/i],
  ["stavy", /šťáva/i],
  ["alkohol", /aperol|vodka|víno|rum|gin/i],
  ["byliny", /heřmánek|ibišek|jasmín|levandule|lipov|meduňk|sencha|čaj|šípek|čaga|ženšen|máta/i],
  ["zelenina", /brambor|cibul|dýně|hlíva|kopr|lišky|petržel|řepa|česnek|špenát|žampion|rajčat|mrkev|celer/i],
  ["koreni", /mlet|badyán|chilli|hřebíček|kardamom|kmín|libeček|majoránk|muškát|paprika|pepř|skořice|vanilk|zázvor|sůl|droždí/i],
  ["cukr", /cukr|kyselina|kokosové mléko|olej|voda/i],
];

export function ingredientGroupKey(name: string, kind: string): string {
  if (kind === "obal") return "obaly";
  for (const [key, re] of RULES) if (re.test(name)) return key;
  return "ostatni";
}
