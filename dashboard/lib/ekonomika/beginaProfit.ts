// Zisk Beginy po surovinách a obalech (Lucie 28. 11. 2026): „kolik měsíčně
// potřebujeme na suroviny“. Počítá se z položek faktur (MojeBegina i starší
// z iDokladu) a z receptur v Nákladech a maržích — stejně jako ve Výrobě.
// Položky, které nejde spárovat s receptem, se ukážou zvlášť („bez nákladu“),
// aby zisk nebyl nafouknutý.
import { calcVariant, quantityInPriceUnit, type PriceUnit, type Recipe, type RecipeIngredient } from "@/lib/receptury/recipes";

export type InvoiceLine = { name: string; quantity: number; totalKc: number };
export type ProfitInvoice = { number: string; month: number; lines: InvoiceLine[] };

/** Doprava na faktuře — „Chlazená přeprava“, „Doprava“, „Poštovné“, „Rozvoz…“. */
export const SHIPPING_RE = /^\s*(doprava|přeprava|chlazen[áý] (doprava|přeprava)|poštovné|rozvoz)/i;
/** Faktury za jinou práci (montáže, zprostředkování…) — nejsou Begina. */
export const WORK_RE = /montáž|zprostředkování|elektro|klimatiz|servis|revize/i;
/** Řádky bez výrobku: slevy, zaokrouhlení (sníží tržbu, ale náklad nemají). */
const NON_PRODUCT_RE = /^\s*(sleva|zaokrouhlen|partnersk|krabice|záloha|vrácení|polybox|polibox|dřevěná reklamní)/i;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Pořadí je důležité: delší / přesnější vzory dřív.
const RULES: [RegExp, string][] = [
  [/rajcat\w*.*rep|rep\w* polev/, "rajcatova-polevka-s-repou"],
  [/tomat|rajcat/, "tomatova-polevka"],
  [/dynov/, "dynova-polevka"],
  [/gulas/, "gulasova-polevka-z-hlivy"],
  [/kulajd/, "kulajda"],
  [/spenat/, "spenatova-polevka"],
  [/malinov\w* svarak/, "malinovy-svarak"],
  [/svarak deluxe/, "svarak-deluxe"],
  [/lady carneval/, "lady-carneval"],
  [/granat/, "granatovy-bond"],
  [/[ck]osmopolitan/, "cosmopolitan"],
  [/dum u jezera/, "dum-u-jezera"],
  [/cervank/, "cervankove-nebe"],
  [/\bzoro\b/, "zoro"],
  [/jasmin/, "jasminovy-zeleny-caj"],
  [/golden nepal|cerny caj/, "cerny-caj-golden-nepal"],
];
const HERBS: [RegExp, string, string][] = [
  [/hermank/, "hermankovy-sirup", "hermankovy-caj"],
  [/ibis/, "ibiskovy-sirup", "ibiskovy-caj"],
  [/lipov/, "lipovy-sirup", "lipovy-caj"],
  [/medun/, "medunkovy-sirup-s-levanduli", "medunkovy-caj-s-levanduli"],
  [/zazvor/, "zazvorovy-sirup", "zazvorovy-caj"],
  [/saman/, "saman-sirup", "bylinny-caj-saman"],
  [/sipk/, "sipkovy-sirup", ""],
];

/** Název položky → slug receptury (null = nepoznáno). */
export function recipeSlugForLine(name: string): string | null {
  const n = fold(name);
  for (const [re, slug] of RULES) if (re.test(n)) return slug;
  for (const [re, sirup, caj] of HERBS) {
    if (!re.test(n)) continue;
    if (/sirup/.test(n)) return sirup;
    if (/\bcaj/.test(n)) return caj || null;
  }
  return null;
}

/**
 * Objem z názvu („3l“, „3 L“, „500 ml“, „– 3 l“). Bez objemu = 3l begina (Jarin 28. 11. 2026);
 * jen sirup za ~200 Kč bez objemu je stará kapsička 650 ml.
 */
export function volumeForLine(name: string, unitPriceKc: number): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i.exec(name);
  if (m) {
    const value = Number(m[1].replace(",", "."));
    return m[2].toLowerCase() === "ml" ? value : value * 1000;
  }
  if (/sirup/i.test(name) && unitPriceKc > 0 && unitPriceKc < 300) return 650;
  return unitPriceKc > 0 ? 3000 : null;
}

export type IngredientUse = { name: string; kind: "surovina" | "obal"; unit: PriceUnit; quantity: number; costKc: number };
export type MonthProfit = {
  month: number;
  revenueKc: number;
  shippingKc: number;
  ingredientsKc: number;
  packagingKc: number;
  /** tržby řádků, ke kterým není recept (zmrzlina, milkshake, nejasné názvy…) */
  unknown: { name: string; quantity: number; totalKc: number }[];
  uses: IngredientUse[];
};

export function profitByMonth(invoices: ProfitInvoice[], recipes: Recipe[], ingredients: RecipeIngredient[]): MonthProfit[] {
  const packaging = new Map(ingredients.filter((i) => i.kind === "obal").map((i) => [i.code, i.priceKc]));
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  const months = new Map<number, MonthProfit & { useMap: Map<string, IngredientUse> }>();
  const get = (month: number) => {
    let m = months.get(month);
    if (!m) {
      m = { month, revenueKc: 0, shippingKc: 0, ingredientsKc: 0, packagingKc: 0, unknown: [], uses: [], useMap: new Map() };
      months.set(month, m);
    }
    return m;
  };
  const packagingByCode = new Map(ingredients.filter((i) => i.kind === "obal").map((i) => [i.code, { name: i.name }]));

  for (const inv of invoices) {
    if (inv.lines.some((l) => WORK_RE.test(l.name))) continue;
    const m = get(inv.month);
    for (const line of inv.lines) {
      m.revenueKc += line.totalKc;
      if (SHIPPING_RE.test(line.name)) {
        m.shippingKc += line.totalKc;
        continue;
      }
      if (NON_PRODUCT_RE.test(line.name) || line.quantity <= 0) continue;
      const slug = recipeSlugForLine(line.name);
      const recipe = slug ? bySlug.get(slug) : undefined;
      const unitPrice = line.quantity > 0 ? line.totalKc / line.quantity : 0;
      const volume = volumeForLine(line.name, unitPrice);
      if (!recipe || volume === null || recipe.variants.length === 0) {
        m.unknown.push({ name: line.name.trim(), quantity: line.quantity, totalKc: line.totalKc });
        continue;
      }
      // nejbližší balení (staré 750 ml kapsičky = dnešních 650 ml)
      const variant = recipe.variants.reduce((best, v) => (Math.abs(v.volumeMl - volume) < Math.abs(best.volumeMl - volume) ? v : best));
      const calc = calcVariant(recipe, { ...variant, volumeMl: volume }, packaging);
      m.ingredientsKc += calc.contentKc * line.quantity;
      m.packagingKc += calc.packagingKc * line.quantity;
      const factor = recipe.batchMl > 0 ? (volume / recipe.batchMl) * line.quantity : 0;
      for (const item of recipe.items) {
        const qty = quantityInPriceUnit(item.quantity, item.unit) * factor;
        const key = item.ingredient.code || item.ingredient.name;
        const use = m.useMap.get(key) ?? { name: item.ingredient.name, kind: item.ingredient.kind, unit: item.ingredient.priceUnit, quantity: 0, costKc: 0 };
        use.quantity += qty;
        use.costKc += qty * item.ingredient.priceKc;
        m.useMap.set(key, use);
      }
      for (const code of variant.packagingCodes) {
        const key = `obal:${code}`;
        const use = m.useMap.get(key) ?? { name: packagingByCode.get(code)?.name ?? code, kind: "obal" as const, unit: "ks" as PriceUnit, quantity: 0, costKc: 0 };
        use.quantity += line.quantity;
        use.costKc += (packaging.get(code) ?? 0) * line.quantity;
        m.useMap.set(key, use);
      }
    }
  }
  return [...months.values()]
    .map(({ useMap, ...m }) => ({ ...m, uses: [...useMap.values()].sort((a, b) => b.costKc - a.costKc) }))
    .sort((a, b) => b.month - a.month);
}
